# Permissions, approvals and action recovery

Proposed feature contract. Qualify enforced policy before repository effects in H3. H4 completes durable approval and recovery. See A4, A5 and A8 in the [implementation plan](../IMPLEMENTATION-PLAN.md).

## Ownership and contract

The gateway owns authenticated repository grants, action decisions and business audit. A decision is allow, ask or deny for the exact normalized action. The harness pauses and resumes the same pending call. The executor requires a current authorized claim and an action ID before dispatch.

The durable sequence is proposed → waiting for approval or authorized → intent recorded → dispatch → terminal result. Denial, expiry, cancellation and revocation can end work before dispatch. An uncertain effect enters reconciliation. A matching authoritative receipt can settle it. Otherwise stop dependent work and surface interruption. Approval binds the actor, scope, run, action ID, arguments, tool version and expiry. A changed action requires a fresh decision.

## Build order and integration

1. Characterize [ingress](../../../src/lib/gateway/server/ingress.ts), the [approval service](../../../src/lib/gateway/server/approval-service.ts) and [approval contract](../../../src/lib/gateway/contracts/approval.ts) using the inert fixture.
2. Add a single normalized action policy shared across executors. Persist pending approval with a stable ID, expiry and version. Authorize the deciding actor and apply the decision idempotently.
3. Persist dispatch intent before the executor can start. Recheck current scope and claim at the executors’ enforcement boundary. Recover the same intent and reconcile before repetition.
4. Connect the runtime to the [approval panel](../../../src/components/gateway/approval-panel.tsx) through [authorized projections](CHAT-EVENTS.md). Log actor and action identity, decision and outcome in the appropriate audit record.

## Acceptance scenarios

- Approve a scoped fixture action through the normal UI. Restart before decision and after decision. Observe one durable decision and one effect with the same action ID.
- Submit denial, expiry, a stale version, wrong scope and duplicate decisions. Prove all refusal cases produce zero dispatch and duplicate approval returns the recorded outcome.
- Terminate the process between intent, dispatch and receipt. Recover known outcomes and stop dependent work for unknown effects. Exhibit the same result when cancellation races with a decision at the dispatch boundary.

Use the [gateway route tests](../../../scripts/test-gateway-routes.mjs) as the existing baseline. Add process interruption and browser approval scenarios with instrumented execution counts.
