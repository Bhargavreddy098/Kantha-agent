# Feature Specification: HAR-005 — Gateway-Mediated Model Inference & Tool Continuation

## 1. Feature ID and Name
- **Feature ID:** `HAR-005`
- **Name:** Gateway-Mediated Model Inference and Sequential Tool Continuation
- **Milestone:** H2 Completion
- **Parent Architecture Domain:** Harness Execution Layer / Gateway Integration

## 2. Purpose
Provides a robust, gateway-mediated inference bridge between the autonomous agent runner (`HarnessRunner`) and external LLM providers. It guarantees per-attempt budget reservations, buffers streamed tool-argument fragments, validates complete tool schemas, enforces sequential tool dispatch, and reconciles usage on every attempt.

## 3. Architecture Owner
- **Primary Owner:** Harness Subsystem (`src/lib/harness/inference.ts`, `src/lib/harness/contracts.ts`)
- **Co-Owner / Boundary:** Gateway Ingress & Usage Service (`src/lib/gateway/server/usage-service.ts`, `src/lib/gateway/providers/`)

## 4. Problem Statement
Autonomous AI coding agents rely on high-volume model completions with tool-calling capabilities. However:
1. In raw streaming inference, models stream JSON tool arguments in partial chunks. If an agent executes an unvalidated or incomplete chunk, catastrophic syntax errors or partial filesystem side-effects occur.
2. In multi-tool batches, models can propose multiple mutating operations. If an early tool fails, executing subsequent sibling tools blindly leads to corrupt repository states.
3. If LLM network calls fail or crash mid-flight, budget ledgers drift unless every attempt is tracked with a two-phase commit (reserve before dispatch, settle upon completion/error).
4. Running an agent loop directly inside an HTTP request handler risks connection drops and duplicated billing upon retry.

## 5. Functional Behavior
1. **Attempt Reservation:** Before any outbound inference request, `GatewayInference` calls `UsageService.reserveAttempt` with the run, step, and estimated prompt tokens. If rejected (budget exceeded), zero outbound network calls are dispatched, returning a typed budget refusal.
2. **Stream Chunk Buffering:** When streaming from the provider adapter, raw text deltas are forwarded immediately to the runner for UI projection, while tool call fragments are buffered in memory until the call stream signals completion.
3. **Tool Call Schema Validation:** Completed tool call payloads are parsed and validated against expected Zod schemas. Malformed JSON or schema mismatches are trapped and converted to typed tool failures.
4. **Tool Batch Management & Sibling Settlement:** When a model returns multiple tool calls in one turn:
   - The runner journals all calls as `tool_batch` before executing call #1.
   - Calls are dispatched sequentially.
   - If any call fails, is denied, or has an uncertain outcome, all unstarted sibling calls are settled as `denied` with the message: `Skipped: earlier call <id> <status>. No dispatch occurred.`
5. **Usage Settlement:** Every attempt settles once with the Gateway ledger, recording actual prompt tokens, completion tokens, latency, finish reason, and cost. If interrupted, the attempt is settled as `unknown` with an audit flag.

## 6. Non-Functional Expectations
- **Reliability:** No duplicate provider dispatches for the same attempt. Transport retries use distinct `attemptId`s.
- **Latency:** Token estimation via `js-tiktoken` completes in <5ms for up to 128k context windows.
- **Output Bounds:** Assistant message deltas batch efficiently; tool results are bounded to 8,192 UTF-8 bytes.
- **Safety:** Provider credentials remain in the Gateway; Harness never sees API keys or bearer tokens.

## 7. Source Code Evidence
- `src/lib/harness/inference.ts`: Current `GatewayInference` implementation and `ScriptedInference` test fixture.
- `src/lib/harness/tokens.ts`: Deterministic token estimator using `js-tiktoken`.
- `src/lib/harness/runner.ts`: Tool batch sequential execution and sibling skipping logic (lines 116–198).
- `src/lib/harness/contracts.ts`: `IHarnessInference`, `HarnessModelRequest`, `HarnessModelResponse`.
- `scripts/test-h2-inference.mjs`: Test suite passing 32 assertions covering budget denial, retry, buffering, and sibling skipping.
- `docs/harness/HANDOFF-H2.md`: Records existing verified fixture state and open qualification work.

## 8. Data and Interface Contracts
- **Input Request Contract:** `HarnessModelRequest`
  ```ts
  interface HarnessModelRequest {
    runId: string;
    modelId: string;
    step: number;
    task: string;
    history: string[];
    tools: HarnessToolDefinition[];
    signal?: AbortSignal;
  }
  ```
- **Output Response Contract:** `HarnessModelResponse`
  ```ts
  interface HarnessModelResponse {
    attemptId: string;
    text: string;
    toolCalls: HarnessToolCall[];
    finishReason: 'stop' | 'tool_calls' | 'cancelled';
  }
  ```
- **Gateway Seam:** `IHarnessInference`
  ```ts
  interface IHarnessInference {
    complete(request: HarnessModelRequest, scope: HarnessScope): Promise<HarnessModelResponse>;
  }
  ```

## 9. Dependencies
- `HAR-001`: Harness domain contracts (`src/lib/harness/contracts.ts`) — `DONE`
- `GW-001`: Gateway authentication & RequestContext — `DONE`
- `GW-003`: Gateway provider connections and language model egress — `DONE`
- `GW-005`: Usage service and durable attempt reservation ledger — `DONE`

## 10. Failure Scenarios
1. **Budget Exhaustion:** `UsageService.reserveAttempt` throws `budget_denied`. Runner halts immediately with status `failed`, zero network dispatch.
2. **Pre-Output Network Failure:** Provider returns HTTP 500 or network drop before emitting text. Harness retries with a new `attemptId` up to configured retry limit.
3. **Mid-Stream Abort / User Cancellation:** `AbortSignal` fires during token streaming. Stream cancels, attempt settles with partial recorded usage, finishReason is `cancelled`.
4. **Malformed Tool Payload:** LLM emits truncated or invalid JSON. Parser rejects payload; runner records tool failure and skips unstarted siblings.
5. **Worker Kill During Outstanding Attempt:** Recovering worker scans unfinalized attempts, records `unknown` status in the ledger, and avoids replaying unconfirmed model actions.

## 11. Security Implications
- Provider API keys remain in Gateway server memory.
- All egress passes through `src/lib/gateway/providers/egress.ts` with domain validation and SSRF defenses.
- Prompts and completions are excluded from default OpenTelemetry logs.

## 12. Testing Strategy
- **Unit / Contract Tests:** `scripts/test-h2-inference.mjs` (32 tests covering reservations, retries, fragment buffering).
- **In-Memory Fixtures:** `src/lib/harness/verify-inference.ts`.
- **Live Provider Qualification (Task HAR-005-01):** Real OpenAI/Anthropic-compatible endpoint smoke test asserting exact `callId` propagation and single settlement.
- **Interruption Injection (Task HAR-005-03):** Process termination during stream response; assert ledger reconciliation.

## 13. Acceptance Criteria
- [ ] 1. Every physical provider attempt is preceded by a durable budget reservation.
- [ ] 2. Budget denial dispatches zero outbound HTTP requests.
- [ ] 3. Streamed tool argument fragments are completely buffered and validated before tool resolution.
- [ ] 4. In multi-tool batches, failure or denial of call `N` commits calls `N+1...M` as skipped with zero dispatch.
- [ ] 5. Live provider adapter maps AI SDK `streamText` chunks into normalized `HarnessModelResponse`.
- [ ] 6. Interrupted attempts reconcile to `unknown` usage without orphan ledger reservations.

## 14. Out-of-Scope Functionality
- Arbitrary code execution or sandbox containers (owned by `HAR-010`).
- Persistent Neon PostgreSQL hosting cutover (owned by `HAR-014`).
- Multi-agent orchestration and subagent spawning (owned by Release 2 Orchestrator).
- Model fine-tuning or custom prompt cache routing.

## 15. Linked Implementation Tasks
- `HAR-005-01`: Qualify live provider adapter (AI SDK `streamText` normalization)
- `HAR-005-02`: Real tool-capable round-trip staging smoke test
- `HAR-005-03`: Persistent hosting topology & graceful shutdown recovery
- `HAR-005-04`: Worker-kill reconciliation & end-to-end usage settlement
