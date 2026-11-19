# Harness sources and documentation guide

The supplied OpenCode report motivates ownership-based modules, explicit contracts, nested engineering guidance and subsystem tests. The [OpenCode source map](../gateway/OPENCODE-HARNESS.md) traces those themes through pinned specifications, protocol, core and server code. Kantha’s proposed behavior lives in the [harness specification](HARNESS.md).

## How the supplied notes inform the design

| Note | Kantha application |
| --- | --- |
| Learn Harness Engineering course explanation | Translate the course's recurring scope, context, environment, state and feedback failures into [runtime requirements](HARNESS.md#failure-modes-the-harness-must-handle). Use the formatter as an initial integration exercise and qualify the lifecycle across repositories and failure conditions. |
| Observability and evaluation comparison | Adopt OTel and repository-based grading. Choose [SigNoz and a repository qualification suite](features/OPERATIONS.md) to cover operational diagnosis and measurable task outcomes. Draw on isolated episodes, deterministic replay and independent review from the comparison. |
| Claude Code session-storage recommendation | Adopt ordered event history and versioned JSONL exports. Use [transactional storage](features/PERSISTENCE.md) for concurrent shared use and recover workspace contents through workspace checkpoints. |

## Useful source documents

| Source | Read for |
| --- | --- |
| [OpenCode engineering instructions](https://github.com/anomalyco/opencode/blob/67139d6827af3a337c80472c33f9cb7c6c2ce500/AGENTS.md) and [tool contributor instructions](https://github.com/anomalyco/opencode/blob/fb67e33a13226fb774dd10a946649270eaacb632/packages/core/src/tool/AGENTS.md) | Dependency direction and local contributor rules. Apply the routing pattern in Kantha’s [AGENTS.md](../../AGENTS.md). |
| [OpenCode V2 session specification](https://github.com/anomalyco/opencode/blob/fb67e33a13226fb774dd10a946649270eaacb632/specs/v2/session.md) and [session protocol](https://github.com/anomalyco/opencode/blob/fb67e33a13226fb774dd10a946649270eaacb632/packages/protocol/src/groups/session.ts) | Follow admission through input delivery, execution, interruption and recovery. Compare internal lifecycle semantics with public commands. |
| [OpenCode V2 tools specification](https://github.com/anomalyco/opencode/blob/fb67e33a13226fb774dd10a946649270eaacb632/specs/v2/tools.md), [registry](https://github.com/anomalyco/opencode/blob/fb67e33a13226fb774dd10a946649270eaacb632/packages/core/src/tool.ts) and [tool runtime](https://github.com/anomalyco/opencode/blob/fb67e33a13226fb774dd10a946649270eaacb632/packages/core/src/tool/runtime.ts) | Follow a definition through capture, validation, execution and result normalization. Study permission decisions separately from registration. |
| [OpenCode agent schema](https://github.com/anomalyco/opencode/blob/fb67e33a13226fb774dd10a946649270eaacb632/packages/schema/src/agent.ts), [permissions](https://opencode.ai/docs/permissions/) and [skills](https://opencode.ai/docs/skills/) | Distinguish agent configuration, effective policy and on-demand instruction bundles. |
| [OpenCode event stream specification](https://github.com/anomalyco/opencode/blob/fb67e33a13226fb774dd10a946649270eaacb632/specs/v2/event-stream-architecture.md), [event protocol](https://github.com/anomalyco/opencode/blob/fb67e33a13226fb774dd10a946649270eaacb632/packages/protocol/src/groups/event.ts) and [HTTP API reference](https://opencode.ai/docs/api) | Follow durable state into client-facing commands, projections and events. |
| [OpenCode test workflow](https://github.com/anomalyco/opencode/blob/67139d6827af3a337c80472c33f9cb7c6c2ce500/.github/workflows/check-test.yml) and [repository test skills](https://github.com/anomalyco/opencode/tree/67139d6827af3a337c80472c33f9cb7c6c2ce500/.opencode/skills) | Find contributor checks across layers. Use Kantha’s [acceptance matrix](IMPLEMENTATION-PLAN.md#acceptance-matrix) for harness requirements. |
| [WalkingLabs practice projects](https://walkinglabs.github.io/learn-harness-engineering/en/projects/), [template guide](https://walkinglabs.github.io/learn-harness-engineering/en/resources/templates/) and [course skills](https://walkinglabs.github.io/learn-harness-engineering/en/skills/) | Find examples of preflight, structured criteria, progress records, clean handoff and evaluator rubrics. Kantha’s product stores run state durably. Use Markdown to describe the contract and expose human-readable evidence. |
| [WalkingLabs harness design comparisons](https://walkinglabs.github.io/learn-harness-engineering/en/harness-designs/) | Compare on-demand context, policy, compaction, feedback and extensions across Pi, Claude Code, Codex and DeepSeek Harness. |

For current Kantha code, begin with the [chat service](../../src/lib/gateway/server/chat-service.ts), [adapter interfaces](../../src/lib/gateway/contracts/adapters.ts), [session service](../../src/lib/gateway/runs/session-service.ts), [approval fixture](../../src/lib/gateway/server/approval-service.ts) and [event feed](../../src/lib/gateway/runs/event-feed.ts). Find baseline evidence in the [route tests](../../scripts/test-gateway-routes.mjs), [chat stream tests](../../scripts/test-chat-stream.mjs) and [gateway fixture checks](../../scripts/test-gateway-fixtures.mjs).

## Course concepts in Kantha

The [English course](https://walkinglabs.github.io/learn-harness-engineering/en/) covers repository guidance for coding agents and reliable execution around the model. Kantha uses the repository for engineering knowledge and its runtime journal for individual runs.

| Source | Design application |
| --- | --- |
| [Lecture 01](https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-01-why-capable-agents-still-fail/) | Attribute failures to scope, context, environment, state or feedback. Rerun a controlled fixture before changing models. |
| [Lecture 02](https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-02-what-a-harness-actually-is/) | Cover instructions, tools, environment, state and feedback in the first release. |
| [Lecture 03](https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-03-why-the-repository-must-become-the-system-of-record/) | Keep engineering decisions and verification instructions in version control. Test discoverability from a fresh session. |
| [Lecture 04](https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-04-why-one-giant-instruction-file-fails/) | Use AGENTS.md as a map. Load subsystem and local guidance on demand. |
| [Lecture 05](https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-05-why-long-running-tasks-lose-continuity/) | Persist evidence, decisions and next actions. Recover without the prior context window. |
| [Lecture 06](https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-06-why-initialization-needs-its-own-phase/) | Pin repository state, verify startup and checks, and agree on scope before editing. |
| [Lecture 07](https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-07-why-agents-overreach-and-under-finish/) | Admit one active task per session. Verify it before expanding scope. |
| [Lecture 08](https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-08-why-feature-lists-are-harness-primitives/) | Give criteria stable IDs, observable behavior, check references and verifier-owned states. |
| [Lecture 09](https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-09-why-agents-declare-victory-too-early/) | Use independent verification and provide actionable failure evidence. |
| [Lecture 10](https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-10-why-end-to-end-testing-changes-results/) | Test the full client → gateway → harness path and turn repeated boundary failures into executable checks. |
| [Lecture 11](https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-11-why-observability-belongs-inside-the-harness/) | Build correlation, redacted telemetry and evidence into the first slice. |
| [Lecture 12](https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-12-why-every-session-must-leave-a-clean-state/) | Record build, test, progress, artifact and startup status at handoff. Reconcile owned resources. |
| [Lecture 13](https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-13-loop-engineering/) | Bound the single-session repair loop by goal, independent verification and stop conditions. Keep scheduled loops for automations. |
| [Lecture 14](https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-14-graph-engineering/) | After harness release, specify state ownership, handoffs, routing, checkpoints and vetoes before choosing a graph engine. |

## How to write the next feature document

Start with the [feature map](features/README.md) and the controlling contract. Trace it from the gateway command or runtime entry point through the owning service, persistence, public projection and tests. When borrowing an upstream design, trace the pinned specification to its implementation and verification evidence.

| Document | Include | Update when |
| --- | --- | --- |
| [Root AGENTS.md](../../AGENTS.md) | Project-wide constraints and links to controlling documents. Add local instructions where contributors need recurring rules for that path. | An agent needs a new entry point or a project-wide rule changes. |
| [Architecture](../../architecture.md) | Ownership, dependency direction, data authority, integration flow and release boundaries. | A responsibility, deployment boundary or permitted dependency changes. |
| [Subsystem specification](HARNESS.md) | Status, user outcome, scope, owning module, interface, lifecycle, authority, failure behavior and observable acceptance criteria. | A caller-visible guarantee changes. Extract a topic file when it develops a distinct owner and contract. |
| [Implementation plan](IMPLEMENTATION-PLAN.md) | Ordered slices, prerequisites, likely touchpoints, failure checks and required evidence. | Sequencing, acceptance checks or release evidence changes. |
| Source guide | Upstream contracts and source pinned where possible, plus local implementation and test links with reading intent. | A design source or implementation entry point changes. |

Write current behavior, fixture evidence and proposals as distinct claims. Keep each rule with its owning document and link to it from consumers. For a change handoff, record scope, state, checks run, result references, unresolved work and the next action. Verify relative links and check that a fresh contributor can trace the feature from `AGENTS.md` to an executable check.

### Feature specification outline

1. **Status and entry point.** Name the milestone and release acceptance IDs. Link current callers and explain the observable user outcome.
2. **Ownership and contract.** Describe inputs, outputs, persisted identities, authority and dependency direction. Link to the existing owner when another feature makes a decision or controls a state transition.
3. **Lifecycle and failure.** Cover the normal path, cancellation and recovery. Include idempotency, concurrency and migration behavior where the feature owns those concerns.
4. **Build order and integration.** List the smallest working increments and the actual code or fixture entry points. Mark future seams as proposed. Name the adjacent contracts that must be available.
5. **Acceptance.** For each scenario record the starting state, action through a supported entry point and observable result. Distinguish a fixture assertion from staging or deployment evidence.
6. **Routing and source documents.** Link the spec from its feature map, and the map from `AGENTS.md`. Point to relevant engineering instructions, architecture specs, API contracts, implementation and checks.

Keep the first version in one feature file. Split a lifecycle, API or testing document when it has enough distinct material for contributors to read it independently. For the next release, create the orchestrator spec around task graphs and child-run recovery. The plugin and automation specs can follow with their own installation or trigger lifecycle, acceptance and operations coverage.
