# Design Specification: Phase 1 Gateway Close-Out & Vault Integration

## 1. Intent & The Why

Phase 1 established the foundational `@kantha/gateway` architecture, including real upstream streaming with `@ai-sdk/*` drivers, SSE stream lifecycles, and failure recovery. However, three security and reliability gaps remain:
1. **Unencrypted BYOK API Keys:** Custom provider keys entered via the Settings UI are stored in plaintext in `.kantha-data/providers.json`, bypassing the AES-256-GCM `VaultService` and SQLite `gateway_secrets` store.
2. **Heartbeat Timer Leaks on Fiber Interruption:** The 15-second `: ping\n\n` SSE heartbeat interval in `chat.ts` is cleared via JavaScript `finally`, which does not reliably fire when an Effect fiber is interrupted (e.g. client disconnect).
3. **Usage Ledger Settlement Races:** The turn finalizer in `service.ts` uses `Effect.forkDaemon` for ledger writes, risking race conditions where subsequent turns check budgets before previous turn costs settle.
4. **Weak Master Key Permissions on Windows:** The master key generation in `key-provider.ts` relies on POSIX `0o600` modes, which are no-ops on Windows NTFS.

Closing these items seals Phase 1 at 100% and guarantees production-grade data security and streaming stability before Phase 2 harness execution.

---

## 2. Goals, Non-Goals & Anti-Goals

### Goals
- **Encrypted Secret Storage:** All custom provider API keys saved in Settings are encrypted with AES-256-GCM (with AAD `provider:${id}`) and persisted exclusively in the SQLite `gateway_secrets` table.
- **Zero Plaintext Keys:** Plaintext `apiKey` fields are completely stripped from `.kantha-data/providers.json`. Automatic one-time migration secures existing keys on startup.
- **Leak-Free Heartbeat:** The 15-second SSE heartbeat timer is tracked and cleared within `Effect.ensuring` across all termination paths (clean completion, client abort, and fiber interruption).
- **Synchronous Budget Settlement:** Normal turn completion awaits `recordTurnUsage` (with a 2-second timeout guard) rather than unanchored `Effect.forkDaemon`.
- **Windows NTFS Key Fencing:** On Windows systems, newly generated `gateway.key` files have inheritance stripped and access restricted strictly to the current user SID via `icacls`.

### Non-Goals
- Phase 2 harness agent execution loops (out of scope for Phase 1 close-out).
- Creating a custom `adapters/ollama.ts` (Ollama will continue to run through `createOpenAICompatible`).

### Anti-Goals
- Never break existing web workbench Settings UI interactions (models discovery, provider test connection, default model selection).
- Never allow an unhandled "write after end" exception on aborted SSE connections.

---

## 3. Approaches Considered

### Approach A: Full Daemon Route Rewrite to Pure Effect Web Server
Rewrite all HTTP route handlers in `apps/daemon/src/api/router.ts` into native `@effect/platform` HTTP routes.
- *Pros:* Fully idiomatic Effect throughout the daemon.
- *Cons:* Out of scope for Phase 1; huge blast radius across auth, pairing, WebSocket upgrade, documents, and PTY endpoints. Rejected.

### Approach B: Direct Gateway Integration via Service Adapters (Recommended)
Preserve the existing `node:http` router contract while updating `apps/daemon/src/services/providerRegistry.ts` and `apps/daemon/src/api/chat.ts` to wire directly into `VaultService` and `GatewayService`:
- On `upsertCustomProvider`: Encrypt `apiKey` into `gateway_secrets` via `VaultStore.setSecret`, save sanitized config to `providers.json`.
- On startup: Migrate legacy plaintext keys in `providers.json` to `gateway_secrets` and overwrite `providers.json` with sanitized records.
- On `getSanitized()`: Check secret presence in SQLite `gateway_secrets` to report `configured: true/false` without leaking keys.
- On `chat.ts`: Move heartbeat cleanup to `Effect.ensuring`.
- On `service.ts`: Await `ledgerStore.recordTurnUsage(entry)` with `Effect.timeout("2 seconds")`.
- On `key-provider.ts`: Run `icacls` on Windows after creating `gateway.key`.
- *Pros:* Minimal diff, 100% backward-compatible with Web Workbench, fixes all security and reliability gaps immediately.

---

## 4. Detailed Component Design

### 4.1. SSE Heartbeat & Interruption Cleanup (`apps/daemon/src/api/chat.ts`)
```ts
let heartbeat: NodeJS.Timeout | undefined;

// Inside handleChatStreamRequest:
res.write(": connected\n\n");
heartbeat = setInterval(() => {
  if (!res.writableEnded) {
    res.write(": ping\n\n");
  }
}, 15_000);

// In Effect.ensuring:
Effect.ensuring(
  Effect.sync(() => {
    if (heartbeat) clearInterval(heartbeat);
    if (!res.writableEnded) {
      res.end();
    }
  })
)
```

### 4.2. Ledger Finalizer Awaiting (`packages/gateway/src/service.ts`)
Replace lines 247-252:
```ts
// Before:
Effect.flatMap((entry) => ledgerStore.recordTurnUsage(entry)),
Effect.timeout("2 seconds"),
Effect.catchAll(() => Effect.void),
Effect.forkDaemon,
Effect.asVoid

// After:
Effect.flatMap((entry) => ledgerStore.recordTurnUsage(entry)),
Effect.timeout("2 seconds"),
Effect.catchAll(() => Effect.void),
Effect.asVoid
```

### 4.3. Windows Key ACL Enforcement (`apps/daemon/src/services/gateway/key-provider.ts`)
```ts
if (process.platform === "win32") {
  try {
    const user = process.env.USERNAME || "";
    if (user) {
      child_process.execSync(
        `icacls "${keyPath}" /inheritance:r /grant:r "${user}:(R,W)"`,
        { stdio: "ignore", timeout: 2000 }
      );
    }
  } catch {
    // Fall back to best-effort
  }
}
```

### 4.4. Encrypted Vault Settings CRUD (`apps/daemon/src/services/providerRegistry.ts`)
1. Inject `db` instance into `ProviderRegistry`.
2. In `upsertCustom(payload)`:
   - If `payload.apiKey` is present:
     - Encrypt using master key with AAD `provider:${id}`.
     - Insert/update into `gateway_secrets` table.
     - Delete `payload.apiKey` before saving to `providers.json`.
3. In `deleteCustom(id)`:
   - Delete from `providers.json`.
   - Delete from `gateway_secrets` where `id = providerId`.
4. In `getSanitized()`:
   - Query `gateway_secrets` keys. If secret exists, mark custom provider as `configured: true`.
5. Automatic startup migration:
   - If any provider in `providers.json` contains plaintext `apiKey`, encrypt and migrate to `gateway_secrets`, then save sanitized `providers.json`.

---

## 5. Verification Plan

1. **Heartbeat Timer:** Unit test verifies client disconnect cancels the timer and leaves 0 dangling handles.
2. **Ledger Turn Cost Settlement:** Verify live run writes to SQLite before next checkBudget call.
3. **Vault Encryption:**
   - Save custom provider via Settings UI or test payload.
   - Verify row exists in `gateway_secrets` with non-empty ciphertext and IV.
   - Verify `.kantha-data/providers.json` contains NO `apiKey` attribute.
   - Verify test connection and chat stream continue to succeed using decrypted key from vault.
4. **Key Permissions:** Verify `icacls` output on Windows shows only the current user.
5. **Full Suite:** All unit tests pass across `@kantha/daemon` and `@kantha/gateway`, and all packages typecheck cleanly.
