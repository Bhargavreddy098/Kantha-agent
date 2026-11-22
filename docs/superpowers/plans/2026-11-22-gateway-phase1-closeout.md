# Phase 1 Gateway Close-Out & Vault Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close out Phase 1 at 100% by hardening SSE heartbeat lifecycles, ensuring synchronous ledger settlement without race conditions, securing Windows master key ACLs, and migrating all Settings UI provider endpoints to encrypted storage via `VaultService` with crash-safe boot migration.

**Architecture:** Route provider API key persistence strictly through `@kantha/gateway`'s `VaultService` (AES-256-GCM in SQLite `gateway_secrets`), leaving `.kantha-data/providers.json` free of plaintext credentials. Tighten the Effect streaming finalizer to await ledger settlement and clean up timers inside `Effect.ensuring`.

**Tech Stack:** Bun v1.4+, TypeScript 5.7+, Effect-TS v3.13+, SQLite WAL (`@kantha/db`), `node:child_process` (`execFileSync`).

**Spec:** `docs/superpowers/specs/2026-11-22-gateway-phase1-closeout-design.md`

## Global Constraints

- Never expose or write plaintext `apiKey` to `.kantha-data/providers.json`.
- All secret encryption and decryption MUST go through `VaultService` to ensure a single, consistent AAD contract (`provider:${id}`).
- Windows NTFS file permission commands (`icacls`) MUST run without shell interpolation (`execFileSync` / `Bun.spawnSync`) to prevent path space injection or `%USERNAME%` expansion failure.
- `ledgerStore.recordTurnUsage` MUST be bounded by a 2-second timeout and swallow errors cleanly via `Effect.catchAll` so finalizers never defect.
- SSE interval callbacks MUST guard against `res.writableEnded` and be cleared in `Effect.ensuring`.

## Review Focus

1. **Metadata-only provider edits wipe keys:** When updating a provider's models or name without re-entering the API key, the existing encrypted secret in `gateway_secrets` must remain intact.
2. **Boot migration data loss:** Power loss or uncaught errors while migrating plaintext keys in `providers.json` must never corrupt or drop user keys; SQLite commits must precede atomic file rename (`.tmp` -> `.json`).
3. **Write-after-end on aborted SSE stream:** If a client drops connection while the 15-second heartbeat timer is active, `clearInterval` in `Effect.ensuring` must prevent timer leaks, and the interval callback must never call `res.write` on an ended stream.
4. **Finalizer defect on ledger write timeout:** When SQLite is temporarily busy during turn recording, `Effect.timeout("2 seconds")` must exit cleanly via `Effect.catchAll` without failing the parent fiber.
5. **Windows keyfile path spaces:** If the project directory path contains spaces (e.g. `C:\Users\John Doe\...`), `icacls` execution must not fail.

---

### Task 1: SSE Heartbeat Cleanup & Ledger Finalizer Hardening

**Files:**
- Modify: `apps/daemon/src/api/chat.ts:275-335`
- Modify: `packages/gateway/src/service.ts:245-255`
- Test: `apps/daemon/src/api/__tests__/chat.test.ts`
- Test: `packages/gateway/src/__tests__/service.test.ts`

**Interfaces:**
- Consumes: `GatewayService.stream`, `Stream.runForEach`, `ledgerStore.recordTurnUsage`
- Produces: Defect-free finalizers and guaranteed timer cleanup on fiber interruption

- [ ] **Step 1: Write unit test verifying heartbeat cleanup on client abort**

In `apps/daemon/src/api/__tests__/chat.test.ts`:
Add a test ensuring that when `res.emit("close")` occurs mid-stream, `clearInterval` is executed and no dangling timer remains.

- [ ] **Step 2: Run test to observe baseline behavior**

Run: `bun test apps/daemon/src/api/__tests__/chat.test.ts`
Expected: Passes existing tests, establishes new coverage requirement.

- [ ] **Step 3: Implement hoisted heartbeat timer and `Effect.ensuring` cleanup in `apps/daemon/src/api/chat.ts`**

Declare `let heartbeat: ReturnType<typeof setInterval> | undefined;` in `handleChatStreamRequest`. Inside `Effect.scoped(Effect.gen(...))`:
```ts
heartbeat = setInterval(() => {
  if (!res.writableEnded) {
    res.write(": ping\n\n");
  }
}, 15_000);
```
In `Effect.ensuring`:
```ts
Effect.ensuring(
  Effect.sync(() => {
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = undefined;
    }
    if (!res.writableEnded) {
      res.end();
    }
  })
)
```

- [ ] **Step 4: Update turn cost ledger finalizer in `packages/gateway/src/service.ts`**

In `packages/gateway/src/service.ts:246-253`, replace `Effect.forkDaemon` with bounded, defect-free awaiting:
```ts
return entry;
}).pipe(
  Effect.flatMap((entry) => ledgerStore.recordTurnUsage(entry)),
  Effect.timeout("2 seconds"),
  Effect.catchAll(() => Effect.void),
  Effect.asVoid
)
```

- [ ] **Step 5: Run tests to verify passing**

Run: `bun test apps/daemon/src/api/__tests__/chat.test.ts && bun test packages/gateway/src/__tests__/service.test.ts`
Expected: PASS (0 fail)

- [ ] **Step 6: Commit**

```bash
git add apps/daemon/src/api/chat.ts packages/gateway/src/service.ts
git commit -m "fix(gateway): harden heartbeat timer cleanup and await ledger finalizer safely"
```

---

### Task 2: Safe Windows Key ACL Enforcement (`key-provider.ts`)

**Files:**
- Modify: `apps/daemon/src/services/gateway/key-provider.ts:35-55`
- Test: `apps/daemon/src/services/__tests__/key-provider.test.ts`

**Interfaces:**
- Consumes: `os.userInfo()`, `node:child_process.execFileSync`
- Produces: Secure 256-bit master key with restricted NTFS permissions on Windows and `0o600` on POSIX

- [ ] **Step 1: Write test for master key generation and permissions**

In `apps/daemon/src/services/__tests__/key-provider.test.ts`:
Verify master key creation, retrieval of existing key, and that permission enforcement does not throw.

- [ ] **Step 2: Run test to verify it fails or needs implementation**

Run: `bun test apps/daemon/src/services/__tests__/key-provider.test.ts`

- [ ] **Step 3: Implement safe `icacls` execution in `key-provider.ts`**

In `apps/daemon/src/services/gateway/key-provider.ts`:
Create a helper `enforceKeyPermissions(filePath: string)`:
```ts
function enforceKeyPermissions(filePath: string): void {
  if (process.platform === "win32") {
    try {
      const username = os.userInfo().username;
      if (username) {
        child_process.execFileSync("icacls", [
          filePath,
          "/inheritance:r",
          "/grant:r",
          `${username}:(R,W)`,
        ], { stdio: "ignore", timeout: 2000 });
      }
    } catch {
      // Best-effort if icacls is restricted in sandbox
    }
  } else {
    try {
      fs.chmodSync(filePath, 0o600);
    } catch {}
  }
}
```
Apply `enforceKeyPermissions(keyPath)` both when reading existing key and when generating a fresh key.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test apps/daemon/src/services/__tests__/key-provider.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/daemon/src/services/gateway/key-provider.ts apps/daemon/src/services/__tests__/key-provider.test.ts
git commit -m "fix(daemon): enforce Windows NTFS ACLs on master key using direct execFileSync"
```

---

### Task 3: Crash-Safe Boot Migration & Encrypted Settings CRUD

**Files:**
- Modify: `apps/daemon/src/services/providerRegistry.ts`
- Modify: `apps/daemon/src/api/router.ts:420-515`
- Test: `apps/daemon/src/api/__tests__/providers-vault.test.ts`

**Interfaces:**
- Consumes: `VaultService.storeSecret`, `VaultService.getDecryptedKey`, `VaultService.deleteSecret`
- Produces: Encrypted BYOK key storage, secret preservation on metadata edits, and atomic scrubbed `providers.json`

- [ ] **Step 1: Write failing tests for Vault Settings CRUD and crash-safe migration**

In `apps/daemon/src/api/__tests__/providers-vault.test.ts`:
1. Test saving custom provider with API key encrypts key into `gateway_secrets` and strips key from `providers.json`.
2. Test metadata-only edit (omitted/empty `apiKey`) preserves existing secret in `gateway_secrets`.
3. Test `DELETE /api/providers/:id` deletes both metadata and encrypted secret.
4. Test boot migration converts legacy plaintext `apiKey` in `providers.json` to SQLite `gateway_secrets` and renames atomic `.tmp` file.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test apps/daemon/src/api/__tests__/providers-vault.test.ts`
Expected: FAIL (CRUD methods not yet using VaultService)

- [ ] **Step 3: Implement atomic crash-safe migration and encrypted CRUD in `providerRegistry.ts`**

In `apps/daemon/src/services/providerRegistry.ts`:
1. Accept `db` and `gatewayLayer` (or `vaultService`) in options.
2. In `migratePlaintextKeys(db, dataDir)`:
   - Read `providers.json`.
   - For every provider with `apiKey`:
     - Encrypt key via `VaultService.storeSecret(provider.id, apiKey)` in SQLite.
     - Delete `p.apiKey` in-memory.
   - Write updated JSON to `providers.json.tmp`, `fs.fsyncSync`, then `fs.renameSync("providers.json.tmp", "providers.json")`.
3. In `upsertCustom(payload)`:
   - If `payload.apiKey?.trim()` is present:
     - Store secret via `vaultService.storeSecret(id, payload.apiKey.trim())`.
   - If `payload.apiKey` is omitted or empty string:
     - Preserve existing secret (do not delete or overwrite).
   - Strip `apiKey` from payload before saving to `providers.json`.
4. In `deleteCustom(id)`:
   - Remove from `providers.json`.
   - Call `vaultService.deleteSecret(id)`.
5. In `testConnection(payload)` and `discoverModels(payload)`:
   - If `payload.apiKey` is missing, resolve decrypted key via `vaultService.getDecryptedKey(payload.id)`.

- [ ] **Step 4: Update `apps/daemon/src/api/router.ts` to wire database into `ProviderRegistry`**

Pass `db` and `gatewayLayer` into `new ProviderRegistry({ dataDir, db, gatewayLayer })`.

- [ ] **Step 5: Run tests to verify passing**

Run: `bun test apps/daemon/src/api/__tests__/providers-vault.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/daemon/src/services/providerRegistry.ts apps/daemon/src/api/router.ts apps/daemon/src/api/__tests__/providers-vault.test.ts
git commit -m "feat(daemon): migrate provider registry to AES-256-GCM VaultService with crash-safe boot migration"
```

---

### Task 4: Full End-to-End Phase 1 Close-Out Verification

**Files:**
- Modify: `docs/CURRENT_STATE.md`
- Test: Full monorepo suites

- [ ] **Step 1: Run comprehensive monorepo test suites**

Run:
```bash
bun test apps/daemon/src/api/__tests__/chat.test.ts
bun test apps/daemon/src/api/__tests__/providers-vault.test.ts
bun test packages/gateway/src/__tests__/
```
Expected: All suites PASS.

- [ ] **Step 2: Run full monorepo typecheck**

Run: `pnpm run -r typecheck`
Expected: 0 errors across `@kantha/daemon`, `@kantha/gateway`, `@kantha/web`, `@kantha/db`, `@kantha/protocol`.

- [ ] **Step 3: Live Ingress & SQLite Verification**

Run a script that:
1. Performs `POST /api/providers` with custom provider + apiKey.
2. Asserts SQLite `gateway_secrets` has the encrypted row.
3. Asserts `.kantha-data/providers.json` has NO plaintext apiKey.
4. Performs `POST /api/chat/stream` through Vite proxy (port 3000) verifying live tokens and `usage_ledger` persistence.

- [ ] **Step 4: Update `docs/CURRENT_STATE.md` recording Phase 1 at 100%**

- [ ] **Step 5: Final Commit**

```bash
git add docs/CURRENT_STATE.md
git commit -m "docs: close out Phase 1 Gateway with 100% completion evidence"
```
