# Kantha development guide

Kantha is moving from gateway-backed chat to a coding assistant that can complete and verify a task in a repository. The Gateway owns identity, repository authority and provider spend. The Harness owns execution, recovery and verification within one session. The Harness is the current release target. Orchestration, plugins and automations follow it. [Product vision](../VISION.md) · [Architecture](../architecture.md)

## Find your starting point

| Need | Open |
| --- | --- |
| See what exists, what is unfinished and what to open next | [Current state](CURRENT_STATE.md) |
| See dependencies and upcoming slices | [Implementation order](roadmap/IMPLEMENTATION-ORDER.md) · [Feature index](roadmap/FEATURE-INDEX.md) |
| Understand behavior or ownership | The active task’s parent spec and the relevant [architecture section](architecture/overview.md) |
| Check which product and architecture decisions are approved | [SDD review](planning/SDD-REVIEW.md) |
| Understand how Kantha itself will manage a model’s context | [Harness context and skills contract](harness/features/CONTEXT-AND-SKILLS.md) |

## Plan, build and verify one task

1. Define the feature outcome, invariants and acceptance criteria in its `SPEC.md`. Record unresolved decisions in the spec and link any applicable ADR.
2. Split the feature into independently verifiable tasks in its `TASKS.md`. Give each task one outcome, direct prerequisites and a verification command. If the task has several independent outcomes, split it before implementation. Use the [task template](roadmap/TASK-TEMPLATE.md).
3. Read the docs in the [repository reading order](../AGENTS.md#documentation-reading-order). Inspect the relevant source and tests. Check the task’s prerequisites and applicable approvals before implementing it.
4. Verify the acceptance criteria and record actual command results in a handoff. Update the task, its feature index and the current-state pointer. Use `IN_REVIEW` when evidence or a required commit is pending.

## Resume after a context reset

Start at [Current state](CURRENT_STATE.md). Follow the reading order and open the linked handoff for the current task if one exists. Compare its claims with `git status --short`, the current diff, and any untracked files the handoff lists. Recheck evidence that is missing, stale, or affected by later edits. Continue from the first unfinished step supported by the repository.

Write or update [the task handoff](handoffs/TEMPLATE.md) at a useful checkpoint, before stopping or compacting, and after verification. Keep the objective, protected constraints, changed files, verification evidence, blockers and one exact next action in the handoff. Keep the current-state file short enough to scan at the beginning of every session. Link detailed evidence from there.
