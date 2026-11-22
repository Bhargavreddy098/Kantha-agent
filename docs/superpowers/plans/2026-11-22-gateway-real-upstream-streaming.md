# Gateway Real Upstream Streaming & Hardened SSE Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the simulated stream in `@kantha/gateway` with real `@ai-sdk/*` live provider streaming wrapped by `createQuirksFetch`, align the daemon dev script to `bun --watch` with fail-fast DB initialization, and harden the SSE lifecycle in `apps/daemon/src/api/chat.ts` to prevent hanging streams.

**Architecture:** Model requests dispatch through `GatewayService.stream`, compiling `KanthaMessage[]` into AI SDK `CoreMessage[]` and invoking live provider adapters (`@ai-sdk/openai-compatible`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`) beneath `createQuirksFetch` (enforcing SSRF, 3-timer timeouts, and proxy quirks). The daemon chat endpoint defers `res.writeHead(200)` until pre-flight passes, maps status codes (402/404/500), catches `fullStream` errors, guarantees `res.end()` via `Effect.ensuring`, and binds fiber interruption to `res.on("close")`.

**Tech Stack:** Bun v1.4+, TypeScript, Effect-TS (`effect`), `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/openai-compatible`, `ai`, Drizzle ORM (`drizzle-orm/bun-sqlite`).

**Spec:** [`docs/superpowers/specs/2026-11-22-gateway-real-upstream-streaming-design.md`](file:///C:/Users/bharg/OneDrive/Desktop/kantha-agent/docs/superpowers/specs/2026-11-22-gateway-real-upstream-streaming-design.md)

---

## Global Constraints

- Never bypass `@kantha/gateway`: All chat streaming must flow through `GatewayService.stream`.
- Never return `db: null` silently: Fail fast with an explicit error if the database driver cannot be loaded.
- Never attach disconnect fiber interruption to `req.on("close")` on POST routes: Use `res.on("close")` guarded by `if (!res.writableEnded)`.
- Never leave an open HTTP connection: Always terminate via `Effect.ensuring(() => { if (!res.writableEnded) res.end(); })`.
- Gate `mock://` base URLs strictly behind `process.env.NODE_ENV === "test"`.

## Review Focus

1. **Client Disconnect vs Body End**: `req.on("close")` fires immediately after reading the POST body in Node/Bun `node:http`. Verify interruption only fires on `res.on("close")` when `!res.writableEnded`.
2. **AI SDK `fullStream` Error Chunks**: Upstream 401/429/500 errors in `streamText().fullStream` yield `{ type: "error", error }` items. Verify these fail the Effect stream rather than ending cleanly with 0 tokens.
3. **Pre-flight Error Status Mapping**: Denied budgets must return HTTP 402/429 JSON, missing provider/model must return HTTP 404 JSON, and unexpected errors must return HTTP 500 JSON before headers are sent.
4. **Immediate Browser Handshake**: Calling `res.flushHeaders()` immediately after `res.writeHead(200)` exits the browser's initial "Pending" state while awaiting first tokens.
5. **Ledger Row Durability**: After live stream completion, `usage_ledger` in SQLite must persist a row containing `inputTokens`, `outputTokens`, `costUsd`, and `status: "completed"`.

---

### Task 1: Real Upstream Provider Streaming in `@kantha/gateway`

**Files:**
- Modify: `packages/gateway/src/service.ts:185-235`
- Test: `packages/gateway/src/__tests__/gateway-service.test.ts`

**Interfaces:**
- Consumes: `createQuirksFetch`, `@ai-sdk/openai-compatible`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`, `streamText`
- Produces: `GatewayService.stream` yielding live `StreamDelta` events with error chunk mapping.

- [ ] **Step 1: Write test for AI SDK `fullStream` error propagation and mock gating**
In `packages/gateway/src/__tests__/gateway-service.test.ts`, add:
  - Test verifying `{ type: "error", error }` chunk from `fullStream` fails the Effect stream with `GatewayError`.
  - Test verifying `mock://` base URL fails when `process.env.NODE_ENV === "production"`.

- [ ] **Step 2: Run gateway tests to verify the new test fails**
Run: `bun test packages/gateway/src/__tests__/gateway-service.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement live upstream driver dispatch in `packages/gateway/src/service.ts`**
  - Gate `mock://` URLs to `process.env.NODE_ENV === "test"`.
  - In non-mock branch:
    1. Instantiate `quirksFetch = createQuirksFetch(provider)`.
    2. Instantiate language model driver based on `provider.type` (`anthropic`, `openai`, `gemini`, `openai_compatible`/`ollama`) passing `apiKey`, `baseURL`, `headers`, and `fetch: quirksFetch`.
    3. Format messages to AI SDK `CoreMessage[]`.
    4. Call `streamText({ model, messages, abortSignal: signal, maxRetries: 0 })`.
    5. Convert `result.fullStream` into an Effect Stream using `Stream.asyncScoped` or `Stream.fromAsyncIterable`:
       - `part.type === "text-delta"`: yield `{ text: part.textDelta }`.
       - `part.type === "reasoning-delta"` / `"reasoning"`: yield `{ reasonings: [{ type: "thinking", text: part.textDelta || part.text }] }`.
       - `part.type === "tool-call"`: yield `{ toolCalls: [...] }`.
       - `part.type === "error"`: fail the stream with `new GatewayError(part.error.message || "Upstream streaming error", part.error)`.
       - `part.type === "finish"`: update `turnUsage` and mark `streamStatus = "completed"`.

- [ ] **Step 4: Run gateway tests to verify they pass**
Run: `bun test packages/gateway`
Expected: PASS (all 36+ tests pass).

- [ ] **Step 5: Commit Task 1**
```bash
git add packages/gateway/src/service.ts packages/gateway/src/__tests__/gateway-service.test.ts
git commit -m "feat(gateway): implement real upstream provider streaming with quirks fetch and error chunk mapping"
```

---

### Task 2: Database Initialization Hardening and Daemon Bun Dev Script

**Files:**
- Modify: `packages/db/src/index.ts:76-115`
- Modify: `apps/daemon/package.json:8`

**Interfaces:**
- Produces: `createKanthaDb()` guaranteeing `db !== null` and throwing `DatabaseInitializationError` if driver is unavailable.
- Configures: `apps/daemon` `"dev"` script running `bun --watch src/index.ts`.

- [ ] **Step 1: Write test for fail-fast database initialization**
In `apps/daemon/src/services/__tests__/gateway-integration.test.ts`, add assertion verifying `createKanthaDb()` returns defined `db` and throws explicitly if sqlite engine cannot initialize.

- [ ] **Step 2: Update `packages/db/src/index.ts` to fail fast**
If `!db`, throw `new Error("Failed to initialize Kantha database: SQLite database driver could not be loaded. Please ensure you are running under Bun runtime (bun run or bun --watch).")`.

- [ ] **Step 3: Update `apps/daemon/package.json` dev script**
Change `"dev": "tsx watch src/index.ts"` to `"dev": "bun --watch src/index.ts"`.

- [ ] **Step 4: Run daemon tests to verify they pass**
Run: `bun test apps/daemon/src/services/__tests__/gateway-integration.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit Task 2**
```bash
git add packages/db/src/index.ts apps/daemon/package.json
git commit -m "fix(db): enforce fail-fast database initialization and switch daemon dev to bun --watch"
```

---

### Task 3: Hardened SSE Lifecycle in Daemon Chat Route

**Files:**
- Modify: `apps/daemon/src/api/chat.ts:245-305`
- Test: `apps/daemon/src/api/__tests__/chat.test.ts`

**Interfaces:**
- Consumes: `GatewayService.stream`, `http.ServerResponse`
- Produces: Fail-safe SSE streaming with pre-flight status mapping, `res.flushHeaders()`, `catchAllCause`, `ensuring(res.end())`, and `res.on("close")` fiber cancellation.

- [ ] **Step 1: Write unit tests for SSE lifecycle and disconnect handling**
In `apps/daemon/src/api/__tests__/chat.test.ts`, add:
  - Test verifying pre-flight budget failure responds with HTTP 402/429 JSON before headers are sent.
  - Test verifying unknown provider/model responds with HTTP 404 JSON.
  - Test verifying stream error mid-flight emits SSE error event and calls `res.end()`.
  - Test verifying client premature disconnect (`res.emit("close")` when `!res.writableEnded`) triggers fiber interruption.

- [ ] **Step 2: Run chat tests to verify new tests fail**
Run: `bun test apps/daemon/src/api/__tests__/chat.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement hardened SSE lifecycle in `apps/daemon/src/api/chat.ts`**
  - Extract pre-flight validation before `res.writeHead`:
    - Budget check rejection -> `res.writeHead(402, ...); res.end(JSON.stringify({ error: "Budget exceeded" }))`.
    - Provider resolution rejection -> `res.writeHead(404, ...); res.end(JSON.stringify({ error: "Provider not found" }))`.
  - Once validated, call `res.writeHead(200, { "Content-Type": "text/event-stream", ... })` and `if (typeof res.flushHeaders === "function") res.flushHeaders()`.
  - Pipe stream program through:
    - `Effect.catchAllCause(cause => Effect.sync(() => { ... format SSE error chunk; res.write("[DONE]\n\n"); }))`.
    - `Effect.ensuring(Effect.sync(() => { if (!res.writableEnded) res.end(); }))`.
  - Attach disconnect listener to `res.on("close", () => { if (!res.writableEnded) Effect.runFork(Fiber.interrupt(fiber)); })`.

- [ ] **Step 4: Run chat tests to verify they pass**
Run: `bun test apps/daemon/src/api/__tests__/chat.test.ts`
Expected: PASS.

- [ ] **Step 5: Run full touched suite and typecheck**
Run: `bun test packages/gateway; bun test apps/daemon; pnpm run --filter @kantha/gateway typecheck; pnpm run --filter @kantha/db typecheck; pnpm run --filter @kantha/daemon typecheck`
Expected: PASS (0 errors).

- [ ] **Step 6: Commit Task 3**
```bash
git add apps/daemon/src/api/chat.ts apps/daemon/src/api/__tests__/chat.test.ts
git commit -m "fix(daemon): harden chat SSE lifecycle with status code mapping and res.on('close') interruption"
```

---

### Task 4: Live End-to-End Verification with `hy4-flash:free`

**Files:**
- Manual / Probe verification script in `apps/daemon`

- [ ] **Step 1: Test live streaming probe to `https://api.cent-ai.dev/v1`**
Run a test script that boots the gateway with the real `custom_1795364174019_q6zh` configuration, sends "hii" to `hy4-flash:free`, and verifies live text chunks arrive.

- [ ] **Step 2: Verify `usage_ledger` database row**
Inspect `usage_ledger` table in `.kantha-data/kantha.sqlite` and confirm a new row was inserted with token counts and non-zero duration.

- [ ] **Step 3: Commit verification log**
```bash
git commit --allow-empty -m "chore(gateway): verify live upstream streaming to cent-ai.dev and ledger persistence"
```
