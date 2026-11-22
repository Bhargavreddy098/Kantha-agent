# Gateway Core (@kantha/gateway) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a transport-agnostic, high-fidelity AI provider Gateway Core package (`@kantha/gateway`) that speaks native protocols to frontier models with zero intelligence loss (preserving reasoning blocks, signatures, prompt caching, and tool calls), enforces strict BYOK key encryption with AAD, blocks SSRF, drives dynamic capability-based intelligence tiers, provides robust token/cost accounting with budget guards, and integrates cleanly into Kantha's daemon.

**Architecture:** Layered port-and-adapter architecture using Effect-TS (`Context.Tag`) for all persistence ports (`VaultStore`, `ProviderStore`, `LedgerStore`, `MasterKeyProvider`, `CatalogCacheStore`), keeping `@kantha/gateway` 100% decoupled from databases or filesystems. Native provider adapters compile a canonical internal request AST into upstream wire payloads via Vercel AI SDK foundation drivers paired with custom pre-flight DNS SSRF validation and quirks interceptors. The daemon wires SQLite/Drizzle concrete stores and consumes the gateway embedded in-process, with interfaces prepared for a future localhost HTTP proxy facade.

**Tech Stack:** Bun v1.4+, TypeScript 5.7+, Effect-TS (`effect`, `@effect/platform`), Vercel AI SDK (`ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/openai-compatible`), Node.js `crypto` (AES-256-GCM), `@kantha/db` (Drizzle + bun:sqlite).

**Spec:** [docs/superpowers/specs/2026-11-22-gateway-core-design.md](../../superpowers/specs/2026-11-22-gateway-core-design.md)

---

## Global Constraints

- **No Cross-Protocol HTTP Translation:** Native provider adapters speak upstream wire protocols natively; the gateway does not convert Anthropic Messages to OpenAI Chat.
- **Port/Adapter Purity:** `@kantha/gateway` must contain zero direct imports of SQLite, Drizzle, or local filesystems; all persistence relies on Effect `Context.Tag` ports.
- **Vault Security:** Encryption must use AES-256-GCM with a fresh 96-bit (12-byte) IV per secret, formatted as `v1:<iv>:<tag>:<ciphertext>`, binding `secretId` / `providerId` as AAD.
- **SSRF Hardening:** Upstream fetches must specify `redirect: "error"`, resolve all DNS records via `dns.lookup(hostname, { all: true })`, block IPv4/IPv6 private/link-local/mapped ranges, `0.0.0.0/8`, `::`, and cloud metadata (`169.254.169.254`), while permitting loopback for `isLocal: true` and LAN for `allowPrivateNetwork: true`.
- **First-Class Interruption:** Fiber interruption must immediately abort upstream HTTP sockets via `AbortSignal`.
- **Non-Blocking Cancellation:** Finalizers recording usage must be guarded with `Effect.timeout` (2s) and `Effect.catchAll` so database stalls never hang turn cancellation.
- **Granular Accounting:** `LedgerEntry` must track `inputTokens`, `outputTokens`, `reasoningTokens`, `cacheReadTokens`, `cacheWrite5mTokens`, `cacheWrite1hTokens`, `costUsd`, `estimated`, and `status`.
- **Dynamic Tiering:** Intelligence Tiers (1 to 4) must be dynamically derived with Tier 4 evaluated first, then Tier 3 (input < $0.50/1M), then Tier 1 (reasoning + tools + frontier price >= $2.00/1M or benchmark override), then Tier 2. Never hardcode stale model name lists.

---

## Review Focus

1. **Opaque Reasoning Signature Stripping:** If an agent turn passes previous assistant reasoning back without Anthropic's exact cryptographic `signature` or OpenAI's encrypted item payload, upstream calls fail with HTTP 400.
   - *Test:* Multi-turn tool test proving `KanthaReasoningBlock` signatures and multiple reasoning blocks round-trip intact through Anthropic adapter.
2. **SSRF Redirect / Multi-Record Rebinding Bypass:** A remote endpoint redirecting to `http://169.254.169.254` or resolving to a mix of public and private IPs (or `0.0.0.0/8`, `::ffff:169.254.169.254`) must be blocked before socket connection.
   - *Test:* SSRF test asserting rejection of redirects, multi-record mixed DNS responses, and mapped IPv6 addresses.
3. **Ciphertext Slot Swapping (AAD Tampering):** If an attacker copies an encrypted API key from one provider slot to another, decryption must fail due to AAD mismatch.
   - *Test:* Vault cipher test asserting decryption failure when AAD differs from the encryption context.
4. **Cancellation Hang on Locked Ledger:** If SQLite is locked or slow when a user cancels a turn, fiber cancellation must complete within 2 seconds without hanging.
   - *Test:* Interruption test simulating a hung `LedgerStore` and verifying cancellation completes immediately.
5. **Offline Startup Failure:** If Kantha starts with no internet access and no previous catalog cache, it must successfully start and offer the bundled snapshot.
   - *Test:* Catalog service test verifying instant offline initialization with bundled snapshot.

---

## Task Breakdown

### Task 1: Package Scaffolding, Contracts, and In-Memory Ports

**Files:**
- Create: `packages/gateway/package.json`
- Create: `packages/gateway/tsconfig.json`
- Create: `packages/gateway/src/types/request.ts`
- Create: `packages/gateway/src/types/catalog.ts`
- Create: `packages/gateway/src/types/provider.ts`
- Create: `packages/gateway/src/types/stream.ts`
- Create: `packages/gateway/src/types/usage.ts`
- Create: `packages/gateway/src/ports/vault.ts`
- Create: `packages/gateway/src/ports/master-key.ts`
- Create: `packages/gateway/src/ports/providers.ts`
- Create: `packages/gateway/src/ports/ledger.ts`
- Create: `packages/gateway/src/ports/cache.ts`
- Create: `packages/gateway/src/ports/in-memory.ts`
- Create: `packages/gateway/src/index.ts`
- Test: `packages/gateway/src/ports/__tests__/ports.test.ts`

**Interfaces:**
- Produces: `InferenceRequest`, `KanthaMessage` (with `reasonings?: KanthaReasoningBlock[]`, `toolResults?: KanthaToolResult[]`), `ProviderConfig`, `LedgerEntry`, `VaultStore`, `ProviderStore`, `LedgerStore` (with `checkBudget`), `MasterKeyProvider`, `CatalogCacheStore`, `InMemoryPortsLayer`.

- [ ] **Step 1: Write failing test for in-memory storage ports**
Create `packages/gateway/src/ports/__tests__/ports.test.ts` asserting that `VaultStore`, `ProviderStore`, `LedgerStore` (including `checkBudget`), and `CatalogCacheStore` can store, retrieve, check budgets, and delete items using `InMemoryPortsLayer`.
- [ ] **Step 2: Run test to verify it fails**
Run: `bun test packages/gateway/src/ports/__tests__/ports.test.ts`
Expected: FAIL (package or modules not found).
- [ ] **Step 3: Create package.json and tsconfig.json in `packages/gateway`**
Configure package `@kantha/gateway` with dependencies: `effect`, `@effect/platform`, `ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/openai-compatible`.
- [ ] **Step 4: Implement domain types in `packages/gateway/src/types/`**
Implement `request.ts`, `catalog.ts`, `provider.ts`, `stream.ts`, and `usage.ts` matching Section 5.1 and 5.6 of the spec (including multi-reasoning arrays and multi-tool results with `toolName`).
- [ ] **Step 5: Implement port interfaces and in-memory test layers in `packages/gateway/src/ports/`**
Define `Context.GenericTag` for each port (including `checkBudget` on `LedgerStore`) and provide `Layer.succeed` in-memory implementations.
- [ ] **Step 6: Run test to verify it passes**
Run: `bun test packages/gateway/src/ports/__tests__/ports.test.ts`
Expected: PASS.
- [ ] **Step 7: Commit**
`git add packages/gateway && git commit -m "feat(gateway): scaffold package, types, and in-memory ports"`

---

### Task 2: AES-256-GCM Vault Cipher with AAD and Key Management

**Files:**
- Create: `packages/gateway/src/vault/cipher.ts`
- Create: `packages/gateway/src/vault/service.ts`
- Test: `packages/gateway/src/vault/__tests__/cipher.test.ts`
- Test: `packages/gateway/src/vault/__tests__/service.test.ts`

**Interfaces:**
- Consumes: `VaultStore`, `MasterKeyProvider` from `packages/gateway/src/ports/`
- Produces: `encryptSecret(plaintext: string, key: Buffer, aad: string): string`, `decryptSecret(ciphertext: string, key: Buffer, aad: string): string`, `VaultService`.

- [ ] **Step 1: Write failing tests for AES-256-GCM cipher with AAD**
Create `packages/gateway/src/vault/__tests__/cipher.test.ts` testing:
  - Encryption produces format `v1:<hex-iv>:<hex-tag>:<hex-ciphertext>`.
  - IV is 12 bytes (96 bits) and distinct on every call.
  - Decrypting with matching AAD succeeds.
  - Decrypting with tampered AAD or tampered ciphertext throws `VaultTamperedError`.
- [ ] **Step 2: Run test to verify it fails**
Run: `bun test packages/gateway/src/vault/__tests__/cipher.test.ts`
Expected: FAIL (`encryptSecret` not defined).
- [ ] **Step 3: Implement `packages/gateway/src/vault/cipher.ts`**
Implement cipher using Node `node:crypto` `createCipheriv('aes-256-gcm', key, iv)`. Set AAD via `cipher.setAAD(Buffer.from(aad, 'utf-8'))`.
- [ ] **Step 4: Implement `packages/gateway/src/vault/service.ts`**
Implement `VaultService` as an Effect service providing `getDecryptedKey(providerId: string)` and `storeSecret(providerId: string, apiKey: string)`.
- [ ] **Step 5: Run tests to verify they pass**
Run: `bun test packages/gateway/src/vault/__tests__/`
Expected: PASS.
- [ ] **Step 6: Commit**
`git add packages/gateway/src/vault && git commit -m "feat(gateway): add AES-256-GCM vault cipher with AAD"`

---

### Task 3: SSRF Protection, Timeouts, and Fetch Quirks Interceptor

**Files:**
- Create: `packages/gateway/src/compat/ssrf.ts`
- Create: `packages/gateway/src/compat/timeouts.ts`
- Create: `packages/gateway/src/compat/fetch-wrapper.ts`
- Test: `packages/gateway/src/compat/__tests__/ssrf.test.ts`
- Test: `packages/gateway/src/compat/__tests__/timeouts.test.ts`

**Interfaces:**
- Produces: `validateEndpointUrl(url: string, opts: { isLocal?: boolean; allowPrivateNetwork?: boolean }): Promise<void>`, `createQuirksFetch(provider: ProviderConfig): typeof fetch`.

- [ ] **Step 1: Write failing tests for SSRF validation and timeouts**
Create `packages/gateway/src/compat/__tests__/ssrf.test.ts` asserting:
  - Multi-record DNS check validates all records (`dns.lookup(hostname, { all: true })`).
  - Rejection of `169.254.169.254`, `0.0.0.0/8`, `::`, `10.0.0.1`, `192.168.1.1`, `::1`, `fc00::1`, `::ffff:169.254.169.254` on default remote URLs.
  - Acceptance of `http://127.0.0.1:11434` and `http://localhost:11434` when `isLocal: true`.
  - Acceptance of `http://192.168.1.50:8000` when `allowPrivateNetwork: true`.
  - Rejection of redirects (`redirect: "error"`).
- [ ] **Step 2: Run test to verify it fails**
Run: `bun test packages/gateway/src/compat/__tests__/ssrf.test.ts`
Expected: FAIL (`validateEndpointUrl` not defined).
- [ ] **Step 3: Implement `packages/gateway/src/compat/ssrf.ts`**
Implement DNS pre-flight resolution with `{ all: true }` and comprehensive IP block checks.
- [ ] **Step 4: Implement `packages/gateway/src/compat/timeouts.ts` and `fetch-wrapper.ts`**
Implement the three-timer model (`headerTimeout`, `chunkTimeout`, `totalTimeout`) and wrap fetch to enforce `redirect: "error"` and inject provider quirks (`cacheFormat`, `maxTokensField`, `encoding: "none"`).
- [ ] **Step 5: Run tests to verify they pass**
Run: `bun test packages/gateway/src/compat/__tests__/`
Expected: PASS.
- [ ] **Step 6: Commit**
`git add packages/gateway/src/compat && git commit -m "feat(gateway): add SSRF validation and three-timer fetch wrapper"`

---

### Task 4: Dynamic Intelligence Tiers and Offline-Resilient Catalog

**Files:**
- Create: `packages/gateway/src/catalog/tiers.ts`
- Create: `packages/gateway/src/catalog/service.ts`
- Create: `packages/gateway/src/catalog/snapshot.json`
- Test: `packages/gateway/src/catalog/__tests__/tiers.test.ts`
- Test: `packages/gateway/src/catalog/__tests__/service.test.ts`

**Interfaces:**
- Consumes: `CatalogCacheStore`
- Produces: `deriveModelTier(model: ModelDefinition): ModelTier`, `CatalogService`.

- [ ] **Step 1: Write failing tests for tier derivation precedence and catalog service**
Create `packages/gateway/src/catalog/__tests__/tiers.test.ts` checking:
  - Step 1: Free or local or non-tool model resolves to Tier 4.
  - Step 2: Low-cost utility model (e.g. Flash/Haiku/mini with input < $0.50/1M) resolves to Tier 3 even if context >= 128k.
  - Step 3: Strong reasoning + tools + frontier price >= $2.00/1M resolves to Tier 1.
  - Step 4: Standard paid model resolves to Tier 2.
  - CatalogService loads downloaded real `snapshot.json` when cache store returns null.
- [ ] **Step 2: Run test to verify it fails**
Run: `bun test packages/gateway/src/catalog/__tests__/tiers.test.ts`
Expected: FAIL.
- [ ] **Step 3: Download and bundle real catalog snapshot in `snapshot.json`**
Fetch full official `catalog.json` from `https://models.dev/catalog.json` and save to `packages/gateway/src/catalog/snapshot.json`.
- [ ] **Step 4: Implement `tiers.ts` and `service.ts`**
Implement dynamic tier derivation with correct evaluation order and catalog sync targeting `https://models.dev/catalog.json`.
- [ ] **Step 5: Run tests to verify they pass**
Run: `bun test packages/gateway/src/catalog/__tests__/`
Expected: PASS.
- [ ] **Step 6: Commit**
`git add packages/gateway/src/catalog && git commit -m "feat(gateway): implement catalog service and dynamic capability tiering"`

---

### Task 5: Native Provider Adapters and Fiber Interruption

**Files:**
- Create: `packages/gateway/src/adapters/base.ts`
- Create: `packages/gateway/src/adapters/openai.ts`
- Create: `packages/gateway/src/adapters/anthropic.ts`
- Create: `packages/gateway/src/adapters/gemini.ts`
- Create: `packages/gateway/src/adapters/ollama.ts`
- Create: `packages/gateway/src/adapters/compatible.ts`
- Test: `packages/gateway/src/adapters/__tests__/anthropic.test.ts`
- Test: `packages/gateway/src/adapters/__tests__/openai.test.ts`
- Test: `packages/gateway/src/adapters/__tests__/compatible.test.ts`
- Test: `packages/gateway/src/adapters/__tests__/interruption.test.ts`

**Interfaces:**
- Consumes: `InferenceRequest`, `createQuirksFetch`, `VaultService`
- Produces: `ProviderAdapter` contract, native stream normalizer yielding `StreamDelta` with reasoning signatures and multi-tool support.

- [ ] **Step 1: Write failing tests for Anthropic reasoning signatures, compatible quirks, and fiber interruption**
Create test files:
  - `anthropic.test.ts`: thinking blocks extract `signature` and round-trip through multi-turn tool loops.
  - `compatible.test.ts`: verifies LiteLLM `cacheFormat: "anthropic"` injection, `maxTokensField` rewriting, `encoding: "none"`, and custom `reasoningField` SSE chunk parsing.
  - `interruption.test.ts`: interrupting the Effect fiber calls `abort()` on the upstream request.
- [ ] **Step 2: Run test to verify it fails**
Run: `bun test packages/gateway/src/adapters/__tests__/`
Expected: FAIL.
- [ ] **Step 3: Implement `adapters/base.ts` and `adapters/anthropic.ts`**
Translate `KanthaMessage[]` to Anthropic Messages format with prompt-cache markers; map thinking blocks and signatures into `StreamDelta`.
- [ ] **Step 4: Implement `adapters/openai.ts`, `gemini.ts`, `ollama.ts`, and `compatible.ts`**
Implement native wire payload compilers and SSE stream delta extractors with multi-tool results and Gemini `toolName` support.
- [ ] **Step 5: Run tests to verify they pass**
Run: `bun test packages/gateway/src/adapters/__tests__/`
Expected: PASS.
- [ ] **Step 6: Commit**
`git add packages/gateway/src/adapters && git commit -m "feat(gateway): implement native provider adapters with reasoning round-trip and quirks handling"`

---

### Task 6: Usage Ledger, Cost Accounting, and Non-Blocking Settlement

**Files:**
- Create: `packages/gateway/src/ledger/calculator.ts`
- Create: `packages/gateway/src/ledger/service.ts`
- Test: `packages/gateway/src/ledger/__tests__/calculator.test.ts`
- Test: `packages/gateway/src/ledger/__tests__/finalizer.test.ts`

**Interfaces:**
- Consumes: `LedgerStore`, `ModelPricing`
- Produces: `calculateTurnCost(usage: TokenUsage, pricing: ModelPricing): number`, `settleTurnUsage(...)`.

- [ ] **Step 1: Write failing tests for token cost calculations and finalizer timeout**
Test:
  - Cache write split: `cacheWrite5mTokens` and `cacheWrite1hTokens` calculated with Anthropic multipliers (1.25x vs 2.0x).
  - Finalizer test: simulating a hung `LedgerStore.recordTurnUsage` and verifying it times out in 2 seconds without hanging fiber completion.
- [ ] **Step 2: Run test to verify it fails**
Run: `bun test packages/gateway/src/ledger/__tests__/`
Expected: FAIL.
- [ ] **Step 3: Implement `ledger/calculator.ts` and `ledger/service.ts`**
Calculate cost breakdown; wrap ledger recording in `Effect.addFinalizer` with `Effect.timeout(Duration.seconds(2))` and `Effect.catchAll`.
- [ ] **Step 4: Run tests to verify they pass**
Run: `bun test packages/gateway/src/ledger/__tests__/`
Expected: PASS.
- [ ] **Step 5: Commit**
`git add packages/gateway/src/ledger && git commit -m "feat(gateway): add token cost calculator and non-blocking usage settlement"`

---

### Task 7: GatewayService Assembly and Daemon Concrete Stores Wiring

**Files:**
- Create: `packages/gateway/src/service.ts`
- Modify: `packages/db/src/schema/` (add `gateway_secrets` and `usage_ledger` tables if absent)
- Create: `apps/daemon/src/services/gateway/sqlite-vault.ts`
- Create: `apps/daemon/src/services/gateway/sqlite-ledger.ts`
- Create: `apps/daemon/src/services/gateway/file-providers.ts`
- Create: `apps/daemon/src/services/gateway/file-cache.ts`
- Create: `apps/daemon/src/services/gateway/key-provider.ts`
- Modify: `apps/daemon/src/api/chat.ts`
- Modify: `apps/daemon/src/api/router.ts`
- Test: `packages/gateway/src/__tests__/gateway-service.test.ts`
- Test: `apps/daemon/src/api/__tests__/gateway-integration.test.ts`

**Interfaces:**
- Produces: `GatewayService` (`stream`, `complete`, `passthrough`, `getCatalog`, `testConnection`).
- Integrates: Wires concrete daemon layers for all 5 ports (`VaultStore`, `MasterKeyProvider`, `ProviderStore`, `LedgerStore` with `checkBudget`, `CatalogCacheStore`), handles Windows ACL / POSIX 0600 on master keyfile, and connects `GatewayService` into `apps/daemon/src/api/chat.ts`.

- [ ] **Step 1: Write failing integration test for GatewayService**
Test end-to-end `GatewayService.stream` call using `InMemoryPortsLayer`.
- [ ] **Step 2: Implement `packages/gateway/src/service.ts`**
Wire together Catalog, Vault, Adapters, Quirks, and Ledger under `GatewayService`. Implement Phase 2 `passthrough` stub.
- [ ] **Step 3: Run gateway unit tests to verify they pass**
Run: `bun test packages/gateway`
Expected: PASS.
- [ ] **Step 4: Implement concrete daemon layers for all 5 ports in `apps/daemon/src/services/gateway/`**
Implement SQLite Drizzle-backed `VaultStore` and `LedgerStore` (with `checkBudget`). Implement `ProviderStore` and `CatalogCacheStore`. Implement `MasterKeyProvider` with POSIX `0600` and Windows ACL handling.
- [ ] **Step 5: Wire `GatewayService` into `apps/daemon` routes**
Update `apps/daemon/src/api/chat.ts` to dispatch via `GatewayService`.
- [ ] **Step 6: Run full monorepo typecheck and test suite**
Run: `bun run typecheck && bun test`
Expected: 0 errors, all tests pass.
- [ ] **Step 7: Commit**
`git add packages/gateway apps/daemon packages/db && git commit -m "feat(gateway): assemble GatewayService and wire all concrete stores in daemon"`
