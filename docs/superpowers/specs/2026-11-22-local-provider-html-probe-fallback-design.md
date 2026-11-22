# Design Specification: Local OpenAI-Compatible Provider Dual-Path Probing & BaseURL Normalization

**Date:** 2026-11-22  
**Status:** Draft / Proposed  
**Author:** Antigravity  

---

## 1. Context & Motivation

When configuring local LLM routers/gateways (such as **FreeLLMAPI**, **LiteLLM**, **vLLM**, or custom reverse proxies) running on `http://127.0.0.1:31415`, users frequently input the root host URL `http://127.0.0.1:31415`.

Many modern local routers host an SPA (Single Page Application) web dashboard on the root host. When receiving requests for non-existent root API endpoints like `GET http://127.0.0.1:31415/models`, their web server responds with `HTTP 200 OK` and `Content-Type: text/html`, returning `<!doctype html>...` (the dashboard's HTML entry point).

The actual OpenAI-compatible API endpoints reside under the `/v1` namespace (e.g. `http://127.0.0.1:31415/v1/models` and `http://127.0.0.1:31415/v1/chat/completions`).

In Kantha's current implementation:
1. `ProviderRegistry.discoverModels()` fetches `${baseURL}/models`. Because the status code is `200 OK`, it executes `await response.json()`. This crashes with `SyntaxError: Unexpected token '<', "<!doctype "... is not valid JSON`.
2. `ProviderRegistry.testConnection()` checks `response.ok` on `GET ${baseURL}/models`. Because the SPA returns `HTTP 200 OK`, the connection test falsely reports success even though no API endpoint was reached.
3. If saved as `http://127.0.0.1:31415`, downstream chat streaming via `@ai-sdk/openai-compatible` posts to `http://127.0.0.1:31415/chat/completions` (instead of `/v1/chat/completions`), failing with HTML/404 errors.

---

## 2. Goals & Non-Goals

### Goals
- **Prevent JSON Parsing Crashes**: Inspect `Content-Type` before calling `response.json()`. If the server returns `text/html` or non-JSON, do not crash with a SyntaxError.
- **Dual-Path Endpoint Probing**:
  - For OpenAI-compatible providers where the base URL does not end with `/v1`, probe `${baseURL}/models`.
  - If `${baseURL}/models` returns HTML, 404, or non-JSON, automatically probe `${baseURL}/v1/models`.
  - If `${baseURL}/v1/models` returns valid JSON, accept the models and recognize `${baseURL}/v1` as the working `normalizedBaseURL`.
- **BaseURL Normalization**:
  - Return `normalizedBaseURL` from `/api/providers/discover` and `/api/providers/test`.
  - Automatically update `SettingsDialog.tsx`'s Base URL field so saving persists `http://127.0.0.1:31415/v1`.
  - In `ProviderRegistry.upsertCustom`, ensure that if a custom provider's base URL needs `/v1` to function, it is stored in normalized form.
- **Accurate Connection Testing**: `testConnection` must require a JSON content type on 200 OK responses to report success, preventing false-positive test results on HTML landing pages.

### Non-Goals
- Altering Anthropic Claude API path conventions (`/messages` vs `/models`).
- Supporting non-standard or proprietary API endpoints without documentation.

---

## 3. Approaches Considered

### Approach 1: Dual-Path Probe & BaseURL Normalization (Selected)
- The daemon tries `${baseURL}/models`. If that returns non-JSON or HTML, it automatically tries `${baseURL}/v1/models`.
- If `/v1/models` succeeds, it returns the discovered models along with `normalizedBaseURL: `${baseURL}/v1``.
- The web frontend updates the Base URL input with the normalized URL and persists it cleanly.
- **Pros:** Zero-friction experience for local developers; handles root URLs, SPA dashboards, and standard `/v1` endpoints transparently.
- **Cons:** Makes at most two fast local HTTP GET requests if the first is an SPA.

### Approach 2: Strict Content-Type Validation with User Action
- Reject any response with `Content-Type: text/html` with an error: `"Endpoint returned HTML instead of JSON. Try adding /v1 to Base URL."`
- **Pros:** Minimal daemon code change.
- **Cons:** Poor user experience; forces the user to manually discover why their local server needs `/v1` and re-type it.

### Approach 3: Frontend Strict URL Rewrite
- Automatically append `/v1` in `SettingsDialog.tsx` if missing.
- **Pros:** Simple in client.
- **Cons:** Breaks custom servers that host `/models` directly at root without `/v1`.

---

## 4. Detailed Design

### 4.1 Content-Type Helper & Safe JSON Parsing
In `apps/daemon/src/services/providerRegistry.ts`:
```typescript
function isJsonResponse(response: Response): boolean {
  const contentType = response.headers.get("content-type") || "";
  return contentType.includes("application/json") || contentType.includes("+json");
}
```

### 4.2 Probing in `discoverModels`
```typescript
public async discoverModels(config: {
  baseURL?: string;
  apiKey?: string;
  headers?: Record<string, string>;
}): Promise<{ models: Array<{ id: string; name: string }>; normalizedBaseURL?: string }> {
  const rawBase = (config.baseURL || "https://api.openai.com/v1").replace(/\/+$/, "");
  
  // Candidates to probe:
  // 1. rawBase (if already ending in /v1 or explicit)
  // 2. If rawBase does not end in /v1, also try rawBase + "/v1"
  const probeBases: string[] = [rawBase];
  if (!rawBase.endsWith("/v1")) {
    probeBases.push(`${rawBase}/v1`);
  }

  let lastError = "";

  for (const candidateBase of probeBases) {
    try {
      const response = await fetch(`${candidateBase}/models`, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(6000),
      });

      if (!response.ok) {
        lastError = `Upstream returned HTTP ${response.status}`;
        continue;
      }

      if (!isJsonResponse(response)) {
        lastError = `Endpoint returned ${response.headers.get("content-type") || "non-JSON"} instead of JSON`;
        continue;
      }

      const data = await response.json();
      const rawList = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : Array.isArray(data) ? data : [];
      const models = parseModelsList(rawList);

      return {
        models,
        normalizedBaseURL: candidateBase !== rawBase ? candidateBase : undefined,
      };
    } catch (err: any) {
      lastError = err.message;
    }
  }

  throw new Error(lastError || "Failed to discover models: endpoint returned non-JSON or unreachable");
}
```

### 4.3 Probing in `testConnection`
Update `testConnection`:
- For OpenAI-compatible providers, probe `${candidateBase}/models`.
- If `response.ok` is true but `!isJsonResponse(response)`:
  - If `candidateBase !== rawBase + "/v1"` and `!rawBase.endsWith("/v1")`, proceed to test `${rawBase}/v1/models`.
  - If both fail or return HTML, report `success: false, error: "Provider returned HTML web page instead of JSON API response. Did you mean to use /v1?"`.
- When successful, include `normalizedBaseURL: candidateBase !== rawBase ? candidateBase : undefined`.

### 4.4 Web Frontend Integration (`SettingsDialog.tsx` & `providerService.ts`)
1. In `apps/web/src/services/providerService.ts`:
   - Extend `DiscoverModelsResponse` and `TestConnectionResponse` with optional `normalizedBaseURL?: string`.
2. In `apps/web/src/components/SettingsDialog.tsx`:
   - In `handleDiscoverModels`:
     ```typescript
     if (res.normalizedBaseURL && res.normalizedBaseURL !== baseURL.trim()) {
       setBaseURL(res.normalizedBaseURL);
     }
     ```
   - In `handleTestConnection`:
     ```typescript
     if (res.normalizedBaseURL && res.normalizedBaseURL !== baseURL.trim()) {
       setBaseURL(res.normalizedBaseURL);
     }
     ```

### 4.5 Regression Testing
- Add unit tests in `apps/daemon/src/services/__tests__/providerRegistry.test.ts`:
  1. Mock server that returns HTML on `GET /models` and valid JSON on `GET /v1/models`.
  2. Verify `discoverModels` detects models and returns `normalizedBaseURL`.
  3. Verify `testConnection` detects `normalizedBaseURL` and rejects pure HTML responses.
  4. Verify end-to-end against live FreeLLMAPI instance on `http://127.0.0.1:31415`.

---

## 5. Verification Plan
1. `bun test apps/daemon/src/services/__tests__/providerRegistry.test.ts`
2. `bun x tsc --noEmit --project apps/daemon/tsconfig.json`
3. `bun x tsc --noEmit --project apps/web/tsconfig.json`
4. `bun run --cwd apps/web build`
5. Live probe test against `http://127.0.0.1:31415` using `freellmapi-3486279a...` key via daemon `discoverModels` and `testConnection`.
