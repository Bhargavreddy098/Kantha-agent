# Chat integration, events and run recovery

Proposed harness integration. The gateway APIs and ordinary chat are the current baseline. See A1, A6 and A8 in the [implementation plan](../IMPLEMENTATION-PLAN.md).

## Ownership and contract

The browser submits task intent and observes execution. The gateway authorizes all commands, projections and artifact reads. The harness journal supplies durable run state. Ordinary Chat keeps the existing AI SDK UI-message response. Repository tasks return a JSON admission receipt and use the authorized gateway SSE feed for assistant text and progress. The timeline and run snapshots hydrate the committed text under stable message and part IDs.

Publish safe run, approval, tool, verification and terminal states. Deduplicate projected runtime events by stable source identity, and order public events by the gateway cursor. Recover expired cursors from a fresh snapshot and its watermark. Stop is a command against the same public run and needs server acknowledgement.

Use the [repository task browser contract](PROJECTION-CONTRACT.md) for discovery, the durable link between a run and its Chat turn, history status, and the versioned snapshot and event semantics. Resolve action review in that turn and the Run details surface described in the [UX](../UX.md).

## Build order and integration

1. Map existing [chat](../../../src/app/chat/page.tsx), [chat API](../../../src/app/api/chat/route.ts), [event API](../../../src/app/api/gateway/events/route.ts), [event feed](../../../src/lib/gateway/runs/event-feed.ts) and [client contracts](../../../src/lib/gateway/client.ts).
2. Add projected runtime state while preserving ordinary chat, model selection and streaming. Feed durable session changes from [sessions](SESSIONS.md) into the gateway projection with stable run and event identities.
3. Present in-progress, pending approval, failed verification, interrupted and completed states, including permission-safe tool details and evidence. Read the [frontend reuse plan](../../frontend/README.md) before changing a screen.
4. Validate staging through the browser and monitor bounded subscriber delivery, reconnect and runtime shutdown. Correlate public run, step and action IDs while keeping raw tool payloads out of default telemetry.

## Acceptance scenarios

- Submit a harness task via the authorized Chat flow. Observe skill/tool progress, approve an exact action when prompted and open the final scoped evidence. Run ordinary chat through the same existing entry point as a regression.
- Reload during an active run and during approval. Test valid, duplicate and expired cursors. Observe one logical turn and one coherent terminal status after resync.
- Stop during execution, then reconnect. Verify acknowledgement and the server’s final outcome. Using another workspace’s run or artifact ID yields no protected data.
- Slow an event subscriber and verify bounded stream behavior while the run progresses and another client stays current.

Use the existing [chat stream](../../../scripts/test-chat-stream.mjs) and [route](../../../scripts/test-gateway-routes.mjs) tests as baselines. Add browser acceptance fixtures for the runtime states above.
