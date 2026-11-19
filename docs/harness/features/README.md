# Harness feature map

Start here from [AGENTS.md](../../../AGENTS.md). The [harness specification](../HARNESS.md) defines shared behavior. The [implementation plan](../IMPLEMENTATION-PLAN.md) defines milestone order and release acceptance. The feature documents define contracts, integration paths and acceptance scenarios. The [H0–H1 handoff](../HANDOFF-H0-H1.md) records current fixture evidence.

Use the [repository task UX](../UX.md) for the Chat flow, wireframes and browser acceptance scenarios.

## Feature documents

| Feature | Primary responsibility | First slice and release checks |
| --- | --- | --- |
| [Sessions and execution](SESSIONS.md) | Input admission and delivery, writer claims, checkpointing, cancellation and recovery | H0–H1 · A2, A5, A6 |
| [Model inference and tool continuation](INFERENCE.md) | Gateway-mediated provider calls, normalized tool conversation and attempt accounting | H0–H2 · A3 |
| [Workspace preparation and repository access](WORKSPACE.md) | Preflight, scoped workspace, repository operations and cleanup | H0, H3 · A4, A7, A8 |
| [Agent definitions, context and skills](CONTEXT-AND-SKILLS.md) | Versioned instructions, skill discovery and load, context assembly and compaction | H3 · A4, A6 |
| [Tool registration, invocation and results](TOOLS.md) | Advertised definitions, schema validation and correlated results | H1, H3 · A3–A5 |
| [Permissions, approvals and action recovery](APPROVALS.md) | Action authorization, durable approval, intent and reconciliation | H3–H4 · A4, A5, A8 |
| [Verification, evidence and handoff](VERIFICATION.md) | Acceptance criteria, check results, bounded repair and completion verdict | H0, H4–H5 · A7, A8 |
| [Chat integration, events and run recovery](CHAT-EVENTS.md) | Authorized commands, streaming, projections and browser recovery | H1, H5 · A1, A6, A8 |
| [Persistence and transcript portability](PERSISTENCE.md) | Transactional journal, PostgreSQL deployment, JSONL export and backup recovery | H1, H5 · A2, A5, A6, A8 |
| [Observability and evaluation](OPERATIONS.md) | OTel signals, SigNoz diagnostics and repository qualification suite | H0–H1, H5 · A8, A9 |

H0–H5 and A1–A9 refer to the [implementation sequence](../IMPLEMENTATION-PLAN.md#implementation-sequence) and [release acceptance matrix](../IMPLEMENTATION-PLAN.md#acceptance-matrix).

## Build the first task end to end

The first fixture uses a display formatter that drops a valid zero value, a known failing check and an unrelated dirty file. The requested outcome is a scoped patch that preserves the zero value and passes the repository check while retaining the unrelated edit. Qualify the same lifecycle on the [independent scenario families](OPERATIONS.md#repository-evaluation-suite) before release.

The [required lifecycle](../HARNESS.md#required-lifecycle-for-every-repository-task) defines the gates that apply to every task. Repository profiles supply workload-specific setup and checks. A fixture's repair behavior serves as test data for the runner and verifier contracts.

1. **H0 · Define the fixture and baseline.** Declare the allowed repository, expected behavior and exact verification profile. Check startup, baseline state and ordinary gateway chat.
2. **H1 · Prove the execution path.** Send the task through the normal submission boundary with a scripted model and an inert tool. Exercise duplicate delivery, Stop and worker restart before adding repository effects.
3. **H2 · Prove the model boundary.** Replace scripted inference for a controlled staging run with one authorized, tool-capable model. Verify the complete call/result conversation and per-attempt ledger entries.
4. **H3 · Prove scoped coding work.** Initialize the fixture workspace, load applicable instructions and an eligible skill, inspect the target, then apply the expected patch using qualified scope checks and a reconcilable action record. Restrict fixture effects to the supported policy.
5. **H4 · Prove approvals and completion.** Use a policy that requires approval for the fixture patch. Resolve the exact action, run the declared check in the qualified executor and record the verdict against the resulting repository state. Repeat with denial, cancellation and a failing check.
6. **H5 · Prove the real entry point.** Run the full workflow from staging Chat. Reload mid-run, reopen the same outcome, inspect the authorized evidence and confirm the baseline dirty file remains. Record what ran, where it ran and what each check established.

Use the [H0–H1 handoff](../HANDOFF-H0-H1.md) for the current implementation entry point, the [documentation authoring guide](../SOURCES.md#how-to-write-the-next-feature-document) when adding another feature spec, and [the architecture release sequence](../../../architecture.md#release-sequence) for orchestrator, plugin and automation prerequisites.
