# Permissions, approvals and action recovery

Proposed feature contract. Qualify enforced policy before repository effects in H3. H4 completes durable approval and recovery. See A4, A5 and A8 in the [implementation plan](../IMPLEMENTATION-PLAN.md).

## Ownership and contract

The gateway owns authenticated repository grants, action decisions and business audit. A decision is allow, ask or deny for the exact normalized action. The harness pauses and resumes the same pending call. The executor requires a current authorized claim and an action ID before dispatch.

The durable sequence is proposed → waiting for approval or authorized → intent recorded → dispatch → terminal result. Denial, expiry, cancellation and revocation can end work before dispatch. An uncertain effect enters reconciliation. A matching authoritative receipt can settle it. Otherwise stop dependent work and surface interruption. Approval binds the actor, scope, run, action ID, arguments, tool version and expiry. A changed action requires a fresh decision.

The action policy and executor derive the operation label, target, parameters, expected effect and patch preview from the exact normalized action and expected workspace state. Bind the preview digest and baseline identity to the decision when preview bytes are involved. A changed target, arguments, or expected state invalidates the old decision. Render agent rationale as optional context clearly attributed to the agent. Only present **Approve once** when the actor can inspect the entire required decision material.

## Unresolved effects

When the executor lacks a conclusive receipt, persist an unresolved action and an interrupted handoff. The gateway fences dependent work on the affected target. V1 exposes the handoff in Chat and an operator-only command against the original run and action. The command takes a stable decision ID, expected action version, disposition, evidence reference, and reason. The gateway derives the actor and scope from authenticated context.

Supported dispositions establish applied, establish no effect, or retain unresolved. The executor or workspace authority verifies the evidence against the target before the gateway records a conclusive disposition. Atomically record the decision, resulting effect state and whether the fence can be released. Replay the same decision idempotently and reject conflicting versions or payloads. Preserve the original verdict and audit entry. Subsequent dependent work requires fresh admission. User acknowledgement alone cannot reconcile the effect.

## Build order and integration

1. Characterize [ingress](../../../src/lib/gateway/server/ingress.ts), the [approval service](../../../src/lib/gateway/server/approval-service.ts) and [approval contract](../../../src/lib/gateway/contracts/approval.ts) using the inert fixture.
2. Add a single normalized action policy shared across executors. Persist pending approval with a stable ID, expiry and version. Authorize the deciding actor and apply the decision idempotently.
3. Persist dispatch intent before the executor can start. Recheck current scope and claim at the executors’ enforcement boundary. Recover the same intent and reconcile before repetition.
4. Connect the runtime to the approval row in the originating Chat turn and its review section in Run details through the [browser contract](PROJECTION-CONTRACT.md). Use the legacy approval panel as fixture evidence for the gateway decision boundary. Log actor and action identity, decision and outcome in the appropriate audit record.

## Acceptance scenarios

- Approve a scoped fixture action through the normal UI. Restart before decision and after decision. Observe one durable decision and one effect with the same action ID.
- Submit denial, expiry, a stale version, wrong scope and duplicate decisions. Prove all refusal cases produce zero dispatch and duplicate approval returns the recorded outcome.
- Terminate the process between intent, dispatch and receipt. Recover known outcomes and stop dependent work for unknown effects. Exhibit the same result when cancellation races with a decision at the dispatch boundary.

Use the [gateway route tests](../../../scripts/test-gateway-routes.mjs) as the existing baseline. Add process interruption and browser approval scenarios with instrumented execution counts.
