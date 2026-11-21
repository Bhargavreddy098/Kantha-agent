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

The authorized Chat timeline joins the gateway-only transcript and harness turns through stable IDs and turn sequence. Each retains its own durable owner. Carry context across modes using the [context contract](CONTEXT-AND-SKILLS.md), including the explicit prior-run link on clarification.

## Durable delivery

For the shared deployment, commit the public run mapping, canonical scoped input, payload digest and pending delivery in one Gateway transaction. Scope deduplication to the authorized session and input identity. Return the existing run on identical replay and a conflict for a changed payload, including before runtime admission. The committed record is eligible across the supported outage window. Keep the [browser submission contract](PROJECTION-CONTRACT.md#discovery-and-admission) and response identity.

Use the PostgreSQL-backed inbox as the first shared delivery mechanism when the host can consume it directly through the delivery interface. If the runtime owns a separate admission store, relay from the same durable record as an outbox and acknowledge delivery only after the runtime commits an idempotent admission receipt. A wake-up signal can reduce pickup latency. Recovery scans the durable records for eligible work and retries with the original identities. A worker crash after admission or before acknowledgement can produce duplicate delivery of one logical run.

Serialize submission, Stop and approval resume against the affected session and run. Record control intent before acknowledging it, and make resume eligible only after the matching approval decision is durable. A waiting run keeps its session admission and action identity while releasing its active execution claim. A pause interrupted before claim release is recovered from the committed pause. A terminal run returns its existing outcome on redelivery. Use a scoped runtime identity for background delivery and revalidate current grants at effect boundaries.

## Worker claims and recovery

Claim and renew one writer lease per session under storage-enforced compare-and-set. Use the authoritative storage clock for shared leases and advance the generation on takeover. Reject stale generations at journal commits and dispatch. Losing the claim stops new work and revokes the old executor's write access. Before allowing mutations on the same target, verify the former generation cannot still mutate it. If termination or isolation is inconclusive, fence dependent work and report interruption. A database write fence protects the journal. The executor must separately enforce revocation for processes and workspaces.

On restart, reconcile pending provider attempts with the Gateway ledger and pending actions with executor receipts or authoritative workspace evidence before resuming dependent work. Reuse the original action identity. Stop racing with dispatch must either prevent it or reconcile the effect already in flight before publishing the final disposition. See [approvals and action recovery](APPROVALS.md#unresolved-effects).

## Build order and integration

1. Characterize the current [session service](../../../src/lib/gateway/runs/session-service.ts), [run contract](../../../src/lib/gateway/contracts/run.ts) and [adapter interfaces](../../../src/lib/gateway/contracts/adapters.ts).
2. Persist the gateway mapping before handoff. Implement a journal with idempotent admission and a storage-backed single-writer claim. Redeliver a pending mapping with the original identity after failure.
3. Run a scripted model step and inert tool through the runner. Append one terminal tool result before building a dependent step. Save the evidence needed to resume without rerunning a completed step.
4. Connect [Chat and events](CHAT-EVENTS.md) for Stop and reconnect. Apply the [approval and action rules](APPROVALS.md) to dispatch and recovery.

## Acceptance scenarios

- Submit twice on separate connections with the same key and payload. Both responses identify one run and one model execution. Submit a different payload with that key and observe conflict.
- Kill the worker after public mapping and before harness admission. Redelivery starts exactly one logical run. Race two workers and prove a reclaimed generation cannot append or dispatch after the replacement claim.
- Kill the Gateway after commit and the relay after the runtime commits admission but before delivery acknowledgement. Recover the same run after the supported outage window is exercised. Verify an approval pause frees the active claim and a durable decision resumes the same action without the original worker.
- Suspend a writer while its executor is active, let the claim expire, and try to resume on the same target. Require confirmed revocation before replacement writes or an interrupted, fenced outcome if revocation cannot be confirmed.
- Stop with an in-flight action and recover with an expired claim. Preserve the same run ID and credit recorded tool results once. Where reconciliation is inconclusive, publish interruption and leave the affected action traceable.

Start from the existing [gateway route checks](../../../scripts/test-gateway-routes.mjs). Add harness process fixtures for the failure boundaries above. Use the [OpenCode session and event references](../SOURCES.md#useful-source-documents) for lifecycle comparison.
