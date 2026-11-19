# Gateway contracts

These contracts cover the first gateway release. See [architecture and sources](README.md), the [agent work plan](IMPLEMENTATION-PLAN.md), and [runtime configuration](RUNNING.md).

## Dependency direction

Shared schemas define public request, response and event types. Services accept validated inputs plus a server-derived request context. Next.js Node route handlers compose services, stores and provider adapters. The browser client consumes shared wire types and the existing AI SDK chat transport. Providers and agent runtimes depend on server-owned interfaces. Keep secrets and database entities out of browser imports.

## Route groups

| Group | Operation | Contract |
|---|---|---|
| Health | `GET /api/gateway/health/live`, `GET /api/gateway/health/ready`, protected `GET /api/gateway/status` | Liveness checks the process. Readiness checks required initialization and storage and returns `503` with `Retry-After` during startup or drain. Probes return coarse status. Protected status adds request correlation and authorized diagnostics. |
| Access | `GET`, `POST` and `DELETE /api/gateway/access` | Read current membership, exchange a provisioned token for a signed HttpOnly browser session, or sign out. A provisioned bearer token also authenticates API requests. The server determines actor, workspace and role. |
| Connections | `/api/gateway/connections` and connection-specific `test` and `discover` commands | Accept a label, upstream URL and a transient key through protected settings. Return connection ID, status, safe endpoint label, timestamps and eligible models. Replace or revoke credentials through explicit commands. Discovery results belong to the connection revision that requested them. |
| Models | Existing `/api/models` and `/api/v1/models` | List safe eligible model metadata by authorized connection. Inventory and chat use the same model identifiers. Update first-party callers to use IDs in place of URLs or credentials. |
| Chat | Existing `POST /api/chat` and `/api/v1/chat/completions` alias | Preserve the AI SDK UI-message stream used by `useChat` and document the alias's existing behavior. Resolve model and provider server-side. Support cancellation, safe error state and request correlation. A separately authenticated native inference endpoint requires a protocol conformance slice. |
| Sessions and runs | `/api/gateway/sessions`, `/api/gateway/sessions/:id/runs`, `/api/gateway/runs/:id/cancel`, `/api/gateway/events?sessionId=…&cursor=…` | Session snapshot includes the current or latest run, pending approval and event cursor. An accepted submission returns a stable run ID. SSE replays events for the authorized session. Normal chat also streams AI SDK UI messages and returns `x-kantha-session-id` and `x-kantha-run-id`. |
| Approvals and usage | `/api/gateway/approvals`, `/api/gateway/approvals/:id`, `/api/gateway/usage` | Create an inert tool run for a session, resolve a decision against its pending version and read the workspace usage totals. Budget decisions are made by the server on the durable ledger. |

## Ingress, credentials and provider attempts

- Derive caller identity and request ID at ingress. Resolve the workspace grant server-side and authorize the target connection, session or run on every read, mutation and event subscription. Apply same-origin mutation protection for browser sessions. Validate size and schema at the boundary. Use service identity for a runtime-facing inference route.
- Use a stable JSON error envelope with `code`, a safe `message`, `requestId` and optional `retryAfterSeconds`. Preserve the current browser response and stream format across the migration. Normalize invalid input, unauthenticated, forbidden, unavailable, rate-limited and upstream-failed cases. Map stream failures to that stream's terminal error mechanism.
- Save credentials using a server-only secret reference. Settings may submit a transient newly entered secret. URLs, responses, browser persistence and telemetry carry safe metadata only. Validate configured egress, including redirects and DNS changes. Permit private endpoints only through an explicit deployment policy. Rotate or revoke a stored key atomically and redact upstream errors.
- Admit and meter each actual provider attempt, including permitted retries and runtime helper calls. Bind the reservation to its attempt ID and settle once. Share one bounded retry policy with the upstream adapter, respect upstream retry guidance and avoid retry once output or a side effect has started. Propagate cancellation and record partial or unknown usage explicitly.

## Capacity and overload

- Inference and event subscriptions use independent process and workspace limits. Workspace saturation returns HTTP 429 with `rate_limited` for chat or `subscriber_overflow` for events. Process saturation returns HTTP 503 with `service_unavailable`. Capacity errors carry `Retry-After: 2`.
- A rejected inference request creates no new run, implicit session, or budget reservation. Replays for an established session return the recorded run before admission. Inference retains capacity through finalization even after the browser disconnects.
- An SSE request without a cursor returns a one-frame snapshot request. A validated subscription holds capacity until disconnect, resync, or stream cleanup. Protected status exposes `metrics.capacity` for the authenticated workspace. See [system design](SYSTEM-DESIGN.md) for lifecycle and rollout details.

## Session and streaming semantics

- Persist workspace-scoped session and run IDs, submission keys, private runtime references, pending approvals, and the minimum recoverable event journal. Pin the selected model and any agent-definition version to the run. When session-backed chat lands, the existing chat route submits through the same run service and returns the run ID with its stream metadata. Each UI turn submits once and uses event reads for status. An identical submission key returns the same run. A conflicting payload for the same key returns a conflict. Enforce one active writer per session and coordinate ownership across workers.
- Give events `type`, `sessionId`, `runId`, `sequence`, `occurredAt` and a typed payload. Start with run state, pending approval, approval resolved and usage updates. `sequence` increases within a session, and the client deduplicates by sequence. Heartbeats carry no application event. On a missing or expired cursor, emit a resync signal and recover from a fresh snapshot with its watermark before resubscribing. A disconnected client resumes observation of the same run.
- Run states include `queued`, `running`, `waiting_for_approval`, `completed`, `failed`, `cancelled` and `interrupted`. Snapshots project the durable app-owned conversation. Cancellation is idempotent and the UI shows its final result after server acknowledgement. On restart, an expired inference lease becomes interrupted with partial output available. Pending approvals retain their original expiration.
- Bind a tool decision to the exact proposed action and authenticated actor. Persist intent before executing through a qualified isolated adapter, then record the outcome. Reconcile uncertain outcomes through the adapter or show interruption. A retry of the approval request returns the recorded decision and cannot repeat a side effect. Start with an inert fixture tool.

See [frontend state and accessibility](../frontend/README.md) for how these contracts appear in the app.
