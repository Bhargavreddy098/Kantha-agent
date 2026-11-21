# Kantha architecture

Kantha is moving from gateway-backed chat to a coding assistant that can carry out and verify work in a repository. The gateway is the baseline for this plan. The harness is the next release. It owns execution within one session. Once that release passes its completion gates, the orchestrator can coordinate multiple runs. Plugins and automations come after the orchestrator.

## Implementation status

| Area | Status in this workspace | Starting point |
| --- | --- | --- |
| Gateway | Existing application code for authenticated chat, provider connections, model discovery, usage, sessions, events and an inert approval fixture. Deployment qualification is tracked separately. | [System design](docs/gateway/SYSTEM-DESIGN.md) · [Contracts](docs/gateway/CONTRACTS.md) · [Running and release checks](docs/gateway/RUNNING.md) |
| Harness | H0–H1 fixtures run through the SQLite-backed Gateway composition. The H2 inference adapter and ordered tool continuation have fixture coverage. Live provider qualification, independent hosting and repository effects remain open. | [H0–H1 handoff](docs/harness/HANDOFF-H0-H1.md) · [Feature map](docs/harness/features/README.md) · [Implementation plan](docs/harness/IMPLEMENTATION-PLAN.md) |
| Orchestrator | Planned after harness release. | [Release sequence](#release-sequence) |
| Plugins and automations | Planned after orchestrator release. | [Release sequence](#release-sequence) |

## Ownership and dependencies

```mermaid
flowchart LR
    Client[Chat client] --> Gateway[Next.js Gateway]
    Gateway --> Inbox[Durable submissions and control commands]
    Inbox --> Host[Independent Harness host]
    Host --> Journal[Runtime journal and checkpoints]
    Host -->|Inference and action authorization| Gateway
    Host --> Executor[Isolated tool and verification executor]
    Journal --> Projection[Gateway projections]
    Projection -->|Authorized snapshots and session SSE| Client
```

The diagram shows the proposed shared deployment. The fixture starts the runner in the Gateway process after committing the public mapping and input. For shared deployment, the Harness host consumes durable work outside the Gateway request and process lifecycle. Keep the interfaces in this repository and qualify the runtime adapter in H2. The selected runtime owns its loop and journal. Keep Next.js route handlers, provider credentials and browser components on the Gateway side of the boundary.

| Owner | Responsibility | Interface other layers use |
| --- | --- | --- |
| Client | Submits user intent, displays assistant and tool activity, requests Stop, renders approvals and reconnects. | Existing AI SDK UI-message stream, gateway commands, snapshots and SSE. |
| Gateway | Derives actor, workspace and repository authority. Owns application session and submission mapping, provider credentials, egress, hard-budget admission, usage settlement and durable business audit. | Scoped run and action commands, attempt admission and inference, authorized read projections. |
| Harness | Owns input delivery within a session, model steps, tool continuation, context, checkpoints, verification and recovery. | Admit or observe a run, cancel, deliver an approval decision and read its projection. |
| Tool execution | Validates the operation against the granted scope, executes it in the qualified environment and returns a bounded result or reconciliation evidence. | Versioned invocation and result contract. Tool lookup and policy decisions remain independent. |

### State ownership

The Gateway owns the public run ID, submission deduplication and authorization. The Harness owns the conversation journal for harness sessions. Existing Gateway-only chat retains its app-owned transcript and AI SDK stream. Commit the public mapping together with a recoverable delivery record. Prefer a PostgreSQL-backed inbox for the shared Kantha profile. When delivery crosses into a runtime-owned store, use the Gateway record as a transactional outbox and obtain a durable admission receipt from that runtime. A broker is an optional transport if the chosen topology needs one. [Sessions and execution](docs/harness/features/SESSIONS.md#durable-delivery)

Treat gateway audit, the harness journal and executor reconciliation as distinct records. A harness checkpoint can prove what the runner recorded. An executor receipt or verified repository state is needed to establish what happened outside the journal. Persist action intent before dispatch and reconcile unknown outcomes before continuing.

The proposed shared deployment uses Neon managed PostgreSQL for transactional state and exports the committed harness journal as versioned JSONL. The current single-process profile and fixtures use SQLite. The [persistence contract](docs/harness/features/PERSISTENCE.md) defines data ownership, recovery and migration. Use OpenTelemetry and SigNoz for diagnostics and the repository evaluation suite for release evidence. [Operations contract](docs/harness/features/OPERATIONS.md)

### From request to verified outcome

1. The Gateway authorizes the request and commits the mapping and scoped input with pinned assets. The repository-task endpoint returns the public run identity. The independent host can pick up the same input after a lost response or Gateway restart.
2. One fenced writer per session claims eligible work. The Harness assembles context and exposes eligible tool definitions. The Gateway admits and settles each physical provider attempt.
3. The Harness checkpoints a pending approval before suspending execution. It resumes on the same action identity and revalidates authority before dispatch. The executor checks the active generation and uses the durable action intent to reconcile an interrupted dispatch.
4. The Harness binds verification evidence to the final candidate and records cleanup disposition. The Gateway projects committed outcomes and appends session SSE events. The browser can reconstruct the same run from authorized snapshots and replay.

## Release sequence

| Release | Owns | Required before moving on |
| --- | --- | --- |
| 1. Harness | One recoverable coding session, built-in tools, scoped skills, verification, permissions and observable outcomes. | Pass all enabled-capability release gates in the [implementation plan](docs/harness/IMPLEMENTATION-PLAN.md). Demonstrate one real repository task and interruption recovery. |
| 2. Orchestrator | Delegation, dependency graphs, concurrency, workspace allocation, cancellation propagation and aggregate outcomes. | Execute each task through a stable harness run contract. Verify parent and child attribution, scoped grants, aggregate budgets, dependency failures and restart recovery. |
| 3. Plugins | Trusted extension installation, versioned extension points and scoped registrations. | Verify compatibility, permission review, provenance, unload/revocation and behavior of in-flight runs pinned to a version. Route contributed capabilities through the existing tool boundary. |
| 4. Automations | Schedules, event triggers, durable dispatch and execution history. | Verify trigger deduplication, missed and overlapping executions, service identity, cancellation, backpressure and audit. Submit through the orchestrator or harness interfaces. |

## Where to make changes

Use [AGENTS.md](AGENTS.md) to select the controlling document. For harness work, trace each change from the [feature contract](docs/harness/HARNESS.md) through its [milestone and acceptance evidence](docs/harness/IMPLEMENTATION-PLAN.md). The [source guide](docs/harness/SOURCES.md) maps the course and OpenCode references to Kantha decisions and explains how to write future feature documents.
