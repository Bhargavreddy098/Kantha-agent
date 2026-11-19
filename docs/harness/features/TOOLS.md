# Tool registration, invocation and results

Proposed feature contract. H1 exercises the inert tool and H3 introduces scoped repository capabilities. See A3–A5 in the [implementation plan](../IMPLEMENTATION-PLAN.md).

## Ownership and contract

The registry owns tool registration and lookup. Tool invocation owns schema validation and normalization. The action policy decides authorization and approval. The executor enforces scope and owns effects and receipts. The session runner waits for durable tool results before using them in another model request.

| Artifact | Required fields and guarantees |
| --- | --- |
| Definition | Stable ID and implementation version, input schema, optional machine output schema, required capability, effect class, timeout and output limits. |
| Advertised snapshot | Exact versions and schemas visible to the model for the request. Successive requests may receive new snapshots. Current grants apply on dispatch. |
| Invocation | Stable call and action identities, pinned definition, normalized arguments, workspace reference and execution claim. Evaluate authority before dispatch. |
| Result | One terminal outcome correlated to the call ID, bounded model-facing content, optional validated machine output and compact safe UI metadata. Larger artifacts use authorized references. |

## Build order and integration

1. Define the first registry and wire an inert tool to the scripted [session runner](SESSIONS.md). Use the [existing inert fixture](../../../src/lib/gateway/server/approval-service.ts) for gateway behavior evidence.
2. Capture the advertised snapshot when [inference](INFERENCE.md) builds a request. Resolve only complete calls against that snapshot. Reject unknown IDs and invalid inputs before effects.
3. Route repository operations through [workspace execution](WORKSPACE.md) and the [action policy](APPROVALS.md). Commit intent before dispatch and a terminal result before continuation.
4. Publish safe tool status to [Chat and events](CHAT-EVENTS.md). Give the model and UI their respective result representations.

## Acceptance scenarios

- Advertise V1, register V2, then execute a valid call from the original request. It uses V1 only while its grant is valid. A revoked grant yields zero dispatch.
- Send incomplete arguments, an invalid schema and an unknown tool. Assert zero dispatch and safe typed outcomes for completed invalid calls.
- Bound oversized results independently for model and UI. Verify machine output against its schema and deny artifact reads outside authorized scope.
- Replay a completed action and deliver its existing result once. Interrupt an uncertain effect and follow the reconciliation contract before another step.

See the [pinned OpenCode tool specification and implementation map](../../gateway/OPENCODE-HARNESS.md#how-the-tools-are-built). Use registration contract checks, scripted model integration and executor failure fixtures.
