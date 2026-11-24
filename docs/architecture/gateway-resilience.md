# Kantha Gateway Resilience Architecture

**Package:** `@kantha/gateway` (`packages/gateway/`)  
**Daemon Adapters:** `apps/daemon/src/services/gateway/` & `apps/daemon/src/services/providerRegistry.ts`

---

## 1. Design Goals

The Kantha Gateway mediates every LLM inference request across Chat mode and the Autonomous Harness Orchestrator. Free and pooled upstream routers (such as OpenRouter `:free` models) frequently return transient HTTP `429` rate limits, `502`/`503` upstream errors, or empty streams. The gateway is engineered so callers receive reliable, observable streaming without leaking partial duplicate output or hanging indefinitely.

---

## 2. Resilience Layers

### 2.1 Deterministic Error Classification (`src/resilience/circuit-breaker.ts`)

Every upstream error is classified by `classifyGatewayError(err)` into one of eight deterministic categories:

| Category | Triggers | Retryable | Trips Circuit |
| :--- | :--- | :---: | :---: |
| `rate_limit` | HTTP `429`, `rate-limited`, `overloaded` | Yes | Yes |
| `timeout` | HTTP `408`/`504`, `TimeoutError`, timed out | Yes | Yes |
| `server_error` | HTTP `5xx`, `bad gateway`, `provider returned error` | Yes | Yes |
| `network` | `ECONNREFUSED`, `ECONNRESET`, `fetch failed` | Yes | Yes |
| `auth` | HTTP `401`/`403`, invalid API key | No | No |
| `budget` | HTTP `402`, budget limit reached | No | No |
| `bad_request` | HTTP `400`/`404`/`422` (`no endpoints found` may failover) | Model-dependent | No |
| `unknown` | Unclassified errors | No | No |

When an upstream server includes a `Retry-After` response header, `computeBackoffMs()` honors the hint (clamped to `maxDelayMs`); otherwise it computes exponential backoff with bounded 25% jitter (`baseDelayMs * 2^attempt`).

### 2.2 Per-Target Circuit Breaker (`CircuitBreakerRegistry`)

Each `(providerId:modelId)` target maintains an isolated circuit breaker state machine:

```
CLOSED ──(3 consecutive trip failures)──► OPEN ──(30s cooldown elapsed)──► HALF_OPEN
   ▲                                                                           │
   └─────────────────────────(probe succeeds)──────────────────────────────────┤
                                                                               ▼
                                                     OPEN ◄──(probe fails)─────┘
```

- **Latency EMA:** Exponential moving average (`alpha = 0.3`) tracks real upstream turnaround latency per target.
- **Telemetry Counters:** Records `totalRequests`, `successfulRequests`, `failedRequests`, `retriedRequests`, and `fallbackRequests`.

### 2.3 Zero-Duplicate Failover Chain

`InferenceRequest` accepts `fallbackTargets?: FallbackTarget[]` and `resilience?: ResilienceOptions`.

1. Candidates are deduplicated into `[primary, ...fallbackTargets]`.
2. For each candidate whose circuit is `closed` or `half_open`, the gateway attempts up to `maxRetries + 1` tries (default `maxRetries: 2`).
3. **Zero-Duplicate Invariant:** Retries and model failovers are **only** triggered before any visible output (`text`, `reasonings`, or `toolCalls`) has been yielded downstream. If a stream fails mid-response after tokens were emitted, the error propagates immediately rather than corrupting the user's transcript.
4. When advancing to a fallback target, the gateway emits a structured `StreamDelta.fallbackEvent` (`{ fromProviderId, fromModelId, toProviderId, toModelId, reason }`) which flows to both `/api/chat/stream` and Harness SSE (`gateway_fallback`).

### 2.4 Fetch Guardrails & OpenRouter Attribution (`src/compat/fetch-wrapper.ts`)

`createQuirksFetch(provider, timeouts)` wraps every provider HTTP call with:
- Pre-flight SSRF URL validation (`validateEndpointUrl`) blocking cloud metadata and private network ranges unless explicitly marked local.
- `redirect: "error"` preventing open-redirect SSRF bypasses.
- Abortable request timeout via `AbortSignal.timeout` composed with caller `AbortSignal.any`.
- Automatic OpenRouter attribution headers (`HTTP-Referer`, `X-Title: Kantha Workbench`) for `openrouter.ai` endpoints.

### 2.5 AI SDK v7 Tool Schema Compatibility (`src/service.ts`)

`formatTools()` wraps declarative JSON Schema definitions using Vercel AI SDK v7's `tool({ description, inputSchema: jsonSchema(...) })`, ensuring full tool-call compatibility across OpenRouter, OpenAI, Anthropic, and Gemini models.

---

## 3. OpenRouter Free-Tier Routing

When `OPENROUTER_API_KEY` is configured:
- `ProviderRegistry.getDefaultModel()` selects `openrouter:openrouter/free` automatically.
- Curated tool-capable `:free` models included in catalog (`packages/gateway/src/catalog/snapshot.json`) and daemon provider registry:
  - `openrouter/free` (Auto Free Router)
  - `google/gemma-4-31b-it:free`
  - `google/gemma-4-26b-a4b-it:free`
  - `nvidia/nemotron-3.5-lightning:free`
  - `nvidia/nemotron-3-ultra-550b-a55b:free`
  - `inclusionai/ling-3.2-flash:free`
- `ProviderRegistry.getFallbackTargets("openrouter", modelId)` supplies up to 3 alternate `:free` models so rate-limited free endpoints fail over transparently.

---

## 4. Observability Endpoint

`GET /api/gateway/health` (protected by ADR-007 session authentication) exposes:
- Live `CircuitBreakerRegistry.getSnapshot()` (`status`, per-target circuit state, latency EMA, totals)
- Active `defaultModel`
- SQLite `usage_ledger` rollups (`totalTurns`, `totalInputTokens`, `totalOutputTokens`, `totalReasoningTokens`, `totalCostUsd`, and `recentTurns`)
