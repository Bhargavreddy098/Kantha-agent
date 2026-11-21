# H2 implementation handoff (partial)

Status: the gateway-mediated inference seam, sequential tool-batch guarantees and
assistant-delta projection are implemented in code and verified in memory. Live
provider qualification, persistent hosting recovery and a staging smoke remain
open; this is fixture evidence, not staging qualification.

## Delivered in code

- `src/lib/harness/inference.ts` — `GatewayInference`, an injectable
  `IHarnessInference`. Every physical attempt is reserved before dispatch with a
  unique `attemptId`/`reservationId` and settled exactly once on success,
  cancellation, error or unknown usage. Budget refusal performs zero upstream
  dispatches. A pre-output transport failure retries with a distinct attempt id.
  Streamed tool-argument fragments are buffered until a complete call arrives and
  validated with `zod`; partial calls are never emitted.
- `src/lib/harness/tokens.ts` — deterministic `js-tiktoken` estimation with a
  fixed encoding and a conservative output/reasoning reservation.
- `src/lib/harness/runner.ts` — the full ordered tool-call list is journaled as
  `tool_batch` before call #1; a denial, failure or uncertain outcome commits a
  terminal result for every remaining sibling before the next model step. The
  proposed v1 caps are enforced (24 logical steps, 20-minute deadline, 8,192-byte
  model-facing tool result). Adjacent text is batched into one part and persisted
  under `(assistantMessageId, partId, deltaSequence)` with a `harness.message_delta`
  SSE event.
- `src/lib/harness/create.ts` — accepts an optional `IHarnessInference` so a
  qualified provider can be injected without changing the journal or projection.
  The default is still `ScriptedInference` so H0/H1 fixtures keep working.

## Checks run

- `npm run test:inference` — 32 assertions: budget refusal, pre-output retry,
  fragment buffering, unknown usage settled once, Stop mid-stream, sequential
  denial with skipped siblings, the 24-step cap and deterministic token counting.
- `npm run test:harness` — 9 baseline assertions still pass.
- `npx tsc --noEmit` and `npm run build` — clean.

## Not yet qualified

- Real provider dispatch adapter (AI SDK `streamText` normalized into
  `InferenceChunk`) and a live tool-capable staging smoke with exact `callId`
  correlation and one ledger entry per physical attempt (A3).
- Delayed redelivery across a persistent hosting topology, graceful shutdown and
  worker-kill reconciliation end to end (A2, A6).
- H3 isolated workspace, context/skills and scoped repository tools; H4 planning,
  approvals, verification and evidence; H5 browser contract, Neon PostgreSQL,
  OTel/SigNoz and the repository evaluation suite.
