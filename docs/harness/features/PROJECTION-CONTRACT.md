# Repository task browser contract

Proposed for the production Chat integration. The H1 fixture uses an earlier snapshot and event shape. This contract uses the existing AI SDK UI-message stream for assistant messages and the gateway feed for durable task state. See the [UX](../UX.md) and [Chat integration](CHAT-EVENTS.md).

## Discovery and admission

Use an authorized task-options read such as `GET /api/gateway/harness/options`. Return `schemaVersion: 1`, deployment availability, and eligible repositories and models. Each repository option carries an opaque ID, display name, permitted relative roots and supported operation labels. A target preview can include a ref name and revision. Each eligible model carries its gateway connection ID, model ID and display label. The options reflect both current grants and qualified deployment capabilities. Return only authorized metadata.

Submit through `POST /api/gateway/harness/runs`. V1 carries `sessionId`, `inputId`, task text, repository ID, connection ID and model ID. The gateway revalidates the selection and resolves the actual grant, revision, runtime profile and check policy. Return the public run ID, originating user message ID and current status. Return the same identity for an identical replay and a conflict for a changed payload. An explicit prior candidate ID may be supported when the workspace contract qualifies it.

Keep an unresolved submission in actor- and workspace-scoped browser storage with the original normalized payload and stable identity. Clear it after a confirmed receipt or definitive rejection, and clear it on sign-out. Restore it on reload and replay the same request when the user checks the submission. A lost acknowledgement keeps the task in the checking state. Retain server deduplication records for the supported replay window and give older unresolved requests an explicit expired result before allowing a fresh task. A lookup-only endpoint is optional.

## Conversation and history

Use the gateway session as the conversation identity and link each run to its originating user message and its assistant message IDs. The authorized session projection assigns a stable increasing turn sequence at admission or ordinary message commit. Display messages and run references in that order. Streaming updates replace parts of the existing message. Restore stable identities after reload, and keep each run attached to the original turn across terminal state and recovery.

Backfill only sessions already mapped to the current actor and workspace. Keep browser-only history available through its existing read path until it has a server mapping. Read history as a paginated summary of authorized conversations with title, last activity time, latest repository task and status. Refresh on opening history, focus, and local run updates. Refresh while history is visible if background status can change. A workspace summary feed can replace polling when qualified. Subscribing to the active session is sufficient for its live detail.

## Snapshot and events

Read the run by public ID. An authorized v1 snapshot carries the following fields. Optional data is absent until confirmed or permitted to read.

| Field | Contract |
| --- | --- |
| Identity and cursor | `schemaVersion: 1`, `sessionId`, `runId`, `userMessageId`, `watermark`, `updatedAt`. The watermark is the last gateway cursor covered by this projection. |
| Run state | Existing gateway `status` plus `phase` of `admitted\|preparing\|executing\|verifying\|finalizing\|recovering`. Optional `substage` of `repairing` carries the affected criterion ID. A durable stop acknowledgement includes its request time. |
| Scope and handoff | Repository label, pinned base revision and model, optional candidate digest, and terminal reason, remaining work, cleanup disposition and next action. Typed reasons include `clarification_required`, `check_unavailable` and `unresolved_effect`. |
| Activity | Ordered rows with stable ID, event time, optional step ID, kind, safe summary and status. Allowed kinds cover workspace, skill, tool, approval, check and recovery. Keep large evidence behind refs. |
| Action | At most one pending approval with action ID, approval version, expiry and trusted render data. Previously resolved decisions carry their decision and time. Dispatch status is independent of the decision and can be `pending\|dispatched\|settled\|uncertain\|ended_before_dispatch`. |
| Changes and checks | Changed relative paths and evidence refs tied to the candidate digest. Check items carry criterion ID, required flag, `pending\|passed\|failed\|blocked\|stale`, candidate digest where evaluated, safe reason and evidence ref. |
| Usage | Gateway-ledger usage marked `reported` with values and units, or `unknown`. Omit while unavailable. |

Extend the existing gateway event envelope with `harness.projection_changed` carrying `schemaVersion: 1`, `sourceEventId`, `runId` and the changed section names. The gateway cursor orders events within the session. The UI can coalesce events and reload the authorized snapshot. Resume after the snapshot watermark, deduplicate by source event ID, and reload on cursor expiry. A snapshot from an older watermark cannot overwrite a newer one. Use polling or reconnect when the feed is interrupted. Keep connection and run status separate.

Resolve approval and Stop via scoped commands. Recheck action version, expiry and authority when deciding. Refetch on conflict or unknown response. Display expiry, decision and dispatch from persisted state. Artifact reads use opaque refs and check current access at read time. Return a generic unavailable response across foreign scope or expired retention.

## Acceptance

Exercise mixed ordinary and repository turns, background task status refresh, lost response plus reload, duplicate or expired cursors, changed approvals and Stop races. A browser reopening an interrupted task can read its authorized handoff before taking any action. Run these alongside the [release acceptance matrix](../IMPLEMENTATION-PLAN.md#acceptance-matrix).
