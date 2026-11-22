# Local Provider HTML Probe Fallback & BaseURL Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent JSON parsing syntax errors when adding local custom providers hosting an SPA web interface on their root path (e.g. FreeLLMAPI on `http://127.0.0.1:31415`) by dual-probing `/models` and `/v1/models`, validating JSON Content-Types, and auto-normalizing `baseURL`.

**Architecture:** Inspect HTTP `Content-Type` headers before parsing JSON to prevent `<!doctype html>` parse errors. For OpenAI-compatible endpoints where the Base URL lacks `/v1`, probe `${baseURL}/models` first; if it returns HTML, 404, or non-JSON, probe `${baseURL}/v1/models`. When `/v1/models` succeeds, return `normalizedBaseURL` so both daemon persistence and web UI inputs adopt the working API path.

**Tech Stack:** Bun v1.4+, TypeScript, React 19, Vite, Astryx Design (`@astryxdesign/core`, `@astryxdesign/theme-neutral`).

**Spec:** [2026-11-22-local-provider-html-probe-fallback-design.md](file:///C:/Users/bharg/OneDrive/Desktop/kantha-agent/docs/superpowers/specs/2026-11-22-local-provider-html-probe-fallback-design.md)

## Global Constraints

- **Safe JSON Parsing**: Never call `response.json()` on responses where `Content-Type` indicates HTML (`text/html`) or non-JSON content.
- **Fail-Safe Probing**: Dual-probing `/models` and `/v1/models` must only trigger when `baseURL` does not already end with `/v1`.
- **BaseURL Normalization**: If `/v1/models` is required for discovery or connection testing, `normalizedBaseURL` must be propagated to daemon persistence and web UI inputs so subsequent chat streaming via `@ai-sdk/openai-compatible` targets `${normalizedBaseURL}/chat/completions`.
- **Design Token Compliance**: All web dialog and UI changes must strictly use Astryx tokens and CSS variables (`var(--swiss-...)`). No Tailwind CSS.

## Review Focus

- Local provider hosting an SPA on root (`http://127.0.0.1:31415` returning HTML on `/models` and JSON on `/v1/models`) must succeed without JSON syntax errors.
- Unreachable or down local server must return a timeout/connection error rather than hanging.
- Server returning HTML on both `/models` and `/v1/models` must return an informative error message explaining that an HTML page was returned instead of JSON.
- Server returning standard JSON on `/models` (e.g. Ollama or vLLM root) must succeed on the first probe without unnecessary `/v1` requests.
- `testConnection` must not report success if the server returns HTTP 200 with `text/html`.

---

### Task 1: Safe Content-Type Validation and Dual-Path Probing in `ProviderRegistry`

**Files:**
- Modify: `apps/daemon/src/services/providerRegistry.ts:368-490`
- Test: `apps/daemon/src/services/__tests__/providerRegistry.test.ts`

**Interfaces:**
- Consumes: Node/Bun fetch API, HTTP headers
- Produces:
  ```typescript
  isJsonResponse(response: Response): boolean
  discoverModels(config: { baseURL?: string; apiKey?: string; headers?: Record<string, string> }): Promise<{ models: Array<{ id: string; name: string }>; normalizedBaseURL?: string }>
  testConnection(config: { baseURL?: string; apiKey?: string; type: string; headers?: Record<string, string> }): Promise<{ success: boolean; latencyMs: number; status?: number; error?: string; normalizedBaseURL?: string }>
  ```

- [ ] **Step 1: Write failing unit test for HTML fallback probe and safe JSON detection**

Add tests in `apps/daemon/src/services/__tests__/providerRegistry.test.ts` mocking:
1. A server returning `HTTP 200 text/html` on `/models` and `HTTP 200 application/json` on `/v1/models`. Verify `discoverModels` succeeds and returns `normalizedBaseURL: "http://mock-server/v1"`.
2. A server returning `HTTP 200 text/html` on both. Verify `testConnection` returns `success: false` with descriptive error.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test apps/daemon/src/services/__tests__/providerRegistry.test.ts`
Expected: FAIL (SyntaxError on HTML JSON parse or missing `normalizedBaseURL`)

- [ ] **Step 3: Implement safe probing and `normalizedBaseURL` in `apps/daemon/src/services/providerRegistry.ts`**

1. Define `isJsonResponse(res: Response): boolean`.
2. In `discoverModels`, build candidate URLs: `[rawBase]` (and `[`${rawBase}/v1`]` if not ending in `/v1`).
3. For each candidate, fetch `${candidate}/models`. If status is OK and `isJsonResponse(res)`, parse JSON and return `{ models, normalizedBaseURL }`. If HTML or non-JSON, continue to next candidate.
4. In `testConnection`, apply candidate loop for OpenAI-compatible providers, requiring `isJsonResponse(res)` on 200 responses to report success, returning `normalizedBaseURL`.
5. In `upsertCustom`, if the provided `baseURL` does not end in `/v1` but `/v1` was verified, preserve the normalized URL.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test apps/daemon/src/services/__tests__/providerRegistry.test.ts`
Expected: PASS (all tests pass)

- [ ] **Step 5: Commit**

```bash
git add apps/daemon/src/services/providerRegistry.ts apps/daemon/src/services/__tests__/providerRegistry.test.ts
git commit -m "feat(daemon): safe dual-path probing and baseURL normalization in providerRegistry"
```

---

### Task 2: Expose `normalizedBaseURL` in Daemon API Routes

**Files:**
- Modify: `apps/daemon/src/api/router.ts:480-510`
- Test: `apps/daemon/src/services/__tests__/providerRegistry.test.ts`

**Interfaces:**
- Consumes: `providerRegistry.discoverModels`, `providerRegistry.testConnection`
- Produces:
  - `POST /api/providers/discover` -> `{ models: Array<{ id: string; name: string }>; normalizedBaseURL?: string; error?: string }`
  - `POST /api/providers/test` -> `{ success: boolean; latencyMs: number; status?: number; error?: string; normalizedBaseURL?: string }`

- [ ] **Step 1: Inspect `apps/daemon/src/api/router.ts` lines 480-510**

Confirm payload formatting for `/api/providers/test` and `/api/providers/discover`.

- [ ] **Step 2: Update `/api/providers/discover` in `router.ts`**

Update route handler to destructure `{ models, normalizedBaseURL }` from `providerRegistry.discoverModels(payload)` and return both in the response JSON.

- [ ] **Step 3: Typecheck daemon**

Run: `bun x tsc --noEmit --project apps/daemon/tsconfig.json`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add apps/daemon/src/api/router.ts
git commit -m "feat(daemon): return normalizedBaseURL from discover and test endpoints"
```

---

### Task 3: Client Provider Service and SettingsDialog Auto-Normalization

**Files:**
- Modify: `apps/web/src/services/providerService.ts:29-40`
- Modify: `apps/web/src/components/SettingsDialog.tsx:120-195`

**Interfaces:**
- Consumes: `DiscoverModelsResponse.normalizedBaseURL`, `TestConnectionResponse.normalizedBaseURL`
- Produces: Auto-updating Base URL input in `SettingsDialog.tsx` when a normalized URL is detected

- [ ] **Step 1: Update response types in `apps/web/src/services/providerService.ts`**

Add `normalizedBaseURL?: string` to `TestConnectionResponse` and `DiscoverModelsResponse`.

- [ ] **Step 2: Update `handleDiscoverModels` in `apps/web/src/components/SettingsDialog.tsx`**

When `res.normalizedBaseURL` is present and differs from `baseURL.trim()`:
Call `setBaseURL(res.normalizedBaseURL)` so the UI displays the working endpoint and saving persists it.

- [ ] **Step 3: Update `handleTestConnection` in `apps/web/src/components/SettingsDialog.tsx`**

When `res.normalizedBaseURL` is present and differs from `baseURL.trim()`:
Call `setBaseURL(res.normalizedBaseURL)` and update connection status.

- [ ] **Step 4: Typecheck web and run production build**

Run: `bun x tsc --noEmit --project apps/web/tsconfig.json; bun run --cwd apps/web build`
Expected: 0 errors, build succeeds

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/services/providerService.ts apps/web/src/components/SettingsDialog.tsx
git commit -m "feat(web): update SettingsDialog to auto-normalize provider baseURL"
```

---

### Task 4: Live Provider Verification & End-to-End Regression Test

**Files:**
- Test: `apps/daemon/src/services/__tests__/providerRegistry.test.ts`
- Live verification: probe `http://127.0.0.1:31415` with key `freellmapi-3486279a...`

**Interfaces:**
- Consumes: Live FreeLLMAPI instance on `http://127.0.0.1:31415`

- [ ] **Step 1: Run comprehensive unit test suite**

Run: `bun test apps/daemon/src/services/__tests__/providerRegistry.test.ts apps/daemon/src/api/__tests__/chat.test.ts`
Expected: All tests pass

- [ ] **Step 2: Run live discovery script against `http://127.0.0.1:31415`**

Run a script that initializes `ProviderRegistry` and calls:
```typescript
const result = await registry.discoverModels({
  baseURL: "http://127.0.0.1:31415",
  apiKey: "freellmapi-3486279a21c823f43360edfb9a4c00205d5f2b871c54ae0d",
});
```
Verify:
1. No JSON syntax error.
2. `result.normalizedBaseURL` is `"http://127.0.0.1:31415/v1"`.
3. Over 50 models discovered (including `auto`, `glm-5.3-flash`, etc.).

- [ ] **Step 3: Commit verification test and plan completion**

```bash
git add apps/daemon/src/services/__tests__/providerRegistry.test.ts
git commit -m "test: add regression tests for HTML dual-path probing and baseURL normalization"
```
