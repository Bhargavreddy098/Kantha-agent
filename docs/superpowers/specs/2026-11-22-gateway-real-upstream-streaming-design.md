# Gateway Real Upstream Streaming & Hardened SSE Lifecycle Design

**Status:** Approved Design  
**Date:** 2026-11-22  
**Owner:** Gateway Subsystem (`packages/gateway`, `apps/daemon`, `packages/db`)  
**Scope:** Real Upstream Streaming Dispatch, Node/Bun DB Initialization, Hardened SSE Lifecycle  

---

## 1. Intent and Why

During live testing with `hy4-flash:free` on `https://api.cent-ai.dev/v1`, sending a prompt caused `/api/chat/stream` to hang indefinitely in `Pending` (0 B transferred) with the UI frozen in "Analyzing request and structuring response...".

Two root causes were diagnosed:
1. **Mock-Green Gap in Gateway Service (`packages/gateway/src/service.ts`)**: `GatewayService.stream` had a simulated delta stream returning hardcoded mock strings instead of executing the live upstream network call via `@ai-sdk/*` wrapped with `createQuirksFetch`.
2. **`db === null` & Unhandled Fiber Crash (`packages/db`, `apps/daemon`)**: When running the daemon under `tsx watch` (Node.js), `createKanthaDb()` only initialized Drizzle for Bun, returning `db: null`. When `GatewayService.stream` called `ledgerStore.checkBudget()`, it crashed with `TypeError: Cannot read properties of null (reading 'select')`. Because `chat.ts` called `res.writeHead(200)` and ran `Effect.runFork(program)` without an error recovery handler or finalizer, `res.end()` was never called, leaving the connection hanging in `Pending`.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
1. **Live Upstream Dispatch in `@kantha/gateway`**: Replace simulated deltas in `packages/gateway/src/service.ts` with live `@ai-sdk/*` model execution (`@ai-sdk/openai-compatible`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`) wrapped with `createQuirksFetch`. All live requests must inherit SSRF protection, 3-timer timeouts, `redirect: "error"`, custom proxy quirks, and `AbortSignal` cancellation.
2. **Definitive DB Initialization & Bun Stack Alignment**: Switch the daemon's `"dev"` script in `apps/daemon/package.json` to `bun --watch src/index.ts` to match the native Bun + `bun:sqlite` stack. In `packages/db/src/index.ts`, throw a loud, fail-fast error on startup if the SQLite database fails to initialize rather than silently returning `db: null`.
3. **Fail-Safe SSE Lifecycle in `chat.ts`**: Never leave an unhandled `Effect.runFork(program)`. Wrap the stream in `Effect.catchAllCause` to emit structured error events and `Effect.ensuring` to guarantee `res.end()` is always called, with `req.on("close")` fiber interruption.

### Non-Goals
- No bypass of `@kantha/gateway`: We will not revert `chat.ts` to call `createLanguageModel` directly. All model traffic flows through `GatewayService.stream`.
- No silent no-ops on uninitialized storage: Storage layers will fail fast with explicit errors if database connections are missing.

### Anti-Goals
- No hanging HTTP connections under any error conditions.
- No silent fallback mocks in production gateway streams.

---

## 3. Approaches Considered

| Approach | Description | Trade-offs | Decision |
|---|---|---|---|
| **Approach 1: Daemon-Level AI SDK Bypass** | Fall back to calling `createLanguageModel` directly in `chat.ts`, leaving gateway mock-only. | Bypasses SSRF, quirks, timeouts, and ledger; fragments streaming architecture. | **REJECTED** |
| **Approach 2: In-Gateway Live SDK Drivers + Hardened SSE Lifecycle** | Wire `@ai-sdk/*` inside `GatewayService.stream` with `createQuirksFetch`, align daemon dev script to `bun --watch`, and wrap `chat.ts` with `catchAllCause` + `ensuring(res.end())`. | Keeps `@kantha/gateway` as the single source of truth; fixes root cause of null DB; prevents any connection hangs. | **SELECTED** |

---

## 4. Technical Architecture & Changes

### 4.1 In-Gateway Live Provider Streaming (`packages/gateway/src/service.ts`)
- Remove simulated deltas at line 211.
- If `provider.baseURL?.startsWith("mock://")`: preserve mock streaming for isolated unit tests.
- For all other providers:
  1. Create `quirksFetch = createQuirksFetch(provider)`.
  2. Instantiate language model driver:
     - `anthropic`: `createAnthropic({ apiKey, baseURL, headers, fetch: quirksFetch })(req.modelId)`
     - `openai`: `createOpenAI({ apiKey, baseURL, headers, fetch: quirksFetch })(req.modelId)`
     - `gemini`: `createGoogleGenerativeAI({ apiKey, baseURL, headers, fetch: quirksFetch })(req.modelId)`
     - `openai_compatible` / `ollama`: `createOpenAICompatible({ name: provider.id, baseURL, apiKey, headers, fetch: quirksFetch })(req.modelId)`
  3. Format messages to AI SDK `CoreMessage[]` (`user`, `assistant`, `system`).
  4. Invoke `streamText({ model, messages, abortSignal: signal, maxRetries: 0 })`.
  5. Convert `result.fullStream` async iterable into an Effect `Stream<StreamDelta, GatewayError>`:
     - Map `text-delta` to `{ text }`.
     - Map `reasoning-delta` / `reasoning` to `{ reasonings: [{ type: "thinking", text }] }`.
     - Map `tool-call` to `{ toolCalls }`.
     - On finish, capture `usage` and set `streamStatus = "completed"`.
     - On stream error, set `streamStatus = "error"`.

### 4.2 Database Initialization & Daemon Dev Script Alignment
1. **`apps/daemon/package.json`**:
   Change `"dev": "tsx watch src/index.ts"` to `"dev": "bun --watch src/index.ts"`.
   This aligns development with production (`"start": "bun run src/index.ts"`) and guarantees `bun:sqlite` and Drizzle are active.
2. **`packages/db/src/index.ts`**:
   If `!db`, throw an explicit error: `"Failed to initialize Kantha database: SQLite database driver could not be loaded. Please run using Bun runtime."`.

### 4.3 Fail-Safe SSE Lifecycle in `apps/daemon/src/api/chat.ts`
- Defer `res.writeHead(200)` until the stream successfully initializes.
- Wrap `program` in:
  - `Effect.catchAllCause(cause => ...)`: If headers sent, write `[Error: ...]` and `[DONE]`; if headers not sent, respond with HTTP 500 JSON.
  - `Effect.ensuring(Effect.sync(() => { if (!res.writableEnded) res.end(); }))`: Guarantees response termination.
  - `req.on("close", () => { clientClosed = true; Effect.runFork(Fiber.interrupt(fiber)); })`: Aborts upstream HTTP requests immediately on browser disconnect.

---

## 5. Verification Plan

1. **Unit Tests**:
   - `bun test packages/gateway` (all 36 unit tests pass).
   - `bun test apps/daemon` (all 54 unit tests pass).
2. **Typecheck**:
   - `pnpm run --filter @kantha/gateway typecheck`
   - `pnpm run --filter @kantha/db typecheck`
   - `pnpm run --filter @kantha/daemon typecheck`
3. **Live End-to-End Verification**:
   - Send live prompt to `hy4-flash:free` (`https://api.cent-ai.dev/v1`).
   - Verify real SSE stream tokens arrive in web workbench.
   - Verify `usage_ledger` records a row with token counts and calculated cost.
