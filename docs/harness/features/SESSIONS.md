# Sessions and execution

Proposed feature contract. Start with [the harness lifecycle](../HARNESS.md#session-and-recovery-contract), [H0–H1](../IMPLEMENTATION-PLAN.md#implementation-sequence) and release checks A2, A5 and A6.

## Ownership and contract

The gateway owns caller authorization, public session and run IDs, submission mapping and public status. The session inbox owns admission and delivery eligibility. The harness runner owns step execution and asks the inbox for eligible input. The journal is the authoritative ordered record for harness conversation and workflow state. The existing gateway-only transcript has its own lifecycle.

The [persistence contract](PERSISTENCE.md) defines journal atomicity, canonical storage and portable JSONL exports.

| Operation | Input and observable result |
| --- | --- |
| Admit | Given a gateway scope, stable input ID and payload digest, return the original receipt on an identical submission. Return conflict for a changed payload or distinct input while the session is busy. |
| Claim and deliver | Claim a generation and commit input promotion before constructing context. A stale generation cannot advance the journal or dispatch a capability. |
| Checkpoint | Commit input position, phase, step, pending approval/action IDs, completed results and workspace reference. Advance the projection with stable source event IDs. |
| Cancel or recover | Stop new dispatch on cancellation. Signal active operations, reconcile unresolved intents and settle the final status. Recovery starts from the last safe checkpoint under a new qualified claim. |

## Build order and integration

1. Characterize the current [session service](../../../src/lib/gateway/runs/session-service.ts), [run contract](../../../src/lib/gateway/contracts/run.ts) and [adapter interfaces](../../../src/lib/gateway/contracts/adapters.ts).
2. Persist the gateway mapping before handoff. Implement a journal with idempotent admission and a storage-backed single-writer claim. Redeliver a pending mapping with the original identity after failure.
3. Run a scripted model step and inert tool through the runner. Append one terminal tool result before building a dependent step. Save the evidence needed to resume without rerunning a completed step.
4. Connect [Chat and events](CHAT-EVENTS.md) for Stop and reconnect. Apply the [approval and action rules](APPROVALS.md) to dispatch and recovery.

## Acceptance scenarios

- Submit twice on separate connections with the same key and payload. Both responses identify one run and one model execution. Submit a different payload with that key and observe conflict.
- Kill the worker after public mapping and before harness admission. Redelivery starts exactly one logical run. Race two workers and prove a reclaimed generation cannot append or dispatch after the replacement claim.
- Stop with an in-flight action and recover with an expired claim. Preserve the same run ID and credit recorded tool results once. Where reconciliation is inconclusive, publish interruption and leave the affected action traceable.

Start from the existing [gateway route checks](../../../scripts/test-gateway-routes.mjs). Add harness process fixtures for the failure boundaries above. Use the [OpenCode session and event references](../SOURCES.md#useful-source-documents) for lifecycle comparison.
