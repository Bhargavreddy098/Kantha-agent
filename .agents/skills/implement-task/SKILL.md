---
name: implement-task
description: Read one task and its dependencies, inspect source, implement only that task, verify, and save handoff. Use when picking up a READY task from the implementation order.
---

# Implement Task

## Purpose

Execute exactly one atomic implementation task from the task registry. No more, no less.

## Prerequisites

1. Read `docs/CURRENT_STATE.md` to find the next ready task.
2. Read the task file at the path indicated.
3. Read all files listed in the task's "Files to inspect" section.
4. Verify all prerequisite tasks are DONE.

## Workflow

1. **Load context**: Read the task file, its parent SPEC.md, and the architecture doc for the domain.
2. **Verify prerequisites**: Check that dependency tasks are marked DONE in FEATURE-INDEX or TASKS.md.
3. **Inspect current state**: Read the files the task says to inspect. Verify "Current implementation" claims.
4. **Implement**: Make ONLY the changes described in "Implementation scope". Do NOT make changes listed in "Out of scope".
5. **Verify invariants**: Confirm all items in "Invariants" still hold.
6. **Run verification**: Execute the commands in "Verification". Record actual results.
7. **Check acceptance criteria**: Verify each criterion in "Acceptance criteria" is met.
8. **Update task status**: Change the task status to IN_REVIEW or DONE.
9. **Write handoff**: Create `docs/handoffs/<TASK-ID>.md` with what was done, files changed, test results, and next action.
10. **Update CURRENT_STATE.md**: Record the completed task and next ready task.

## Rules

- Do NOT implement features from other tasks
- Do NOT refactor unrelated code
- Do NOT skip verification
- Do NOT mark a task DONE without all acceptance criteria met
- If context is running out, write a handoff at the current boundary and stop
