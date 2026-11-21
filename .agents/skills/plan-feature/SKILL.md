---
name: plan-feature
description: Inspect one feature, establish its boundaries, and create independently executable task documents. Use when decomposing a feature from the FEATURE-INDEX into atomic implementation tasks.
---

# Plan Feature

## Purpose

Break one feature specification into independently executable atomic tasks that can each be completed in a single AI coding conversation.

## Prerequisites

1. Read `AGENTS.md` for the documentation reading order.
2. Read `docs/roadmap/FEATURE-INDEX.md` to find the feature by ID.
3. Read the feature's SPEC.md if it exists.
4. Read the relevant architecture document (`docs/architecture/`) for context.

## Workflow

1. **Identify the feature** by its stable ID (e.g., HAR-009).
2. **Read the existing spec** at `docs/features/<domain>/<feature-id>/SPEC.md`.
3. **Inspect the source code** referenced in the spec. Verify what exists vs. what is proposed.
4. **Identify boundaries**: What contracts must this feature satisfy? What interfaces does it consume? What does it produce?
5. **Decompose into tasks** following these rules:
   - Each task has ONE specific objective
   - Each task fits in ONE focused coding conversation
   - Each task requires bounded repository context (≤5 files to change)
   - Each task has independently verifiable acceptance criteria
   - No circular dependencies between tasks
6. **Write task files** at `docs/features/<domain>/<feature-id>/tasks/<TASK-ID>.md` using the atomic task template from `docs/roadmap/TASK-TEMPLATE.md`.
7. **Write TASKS.md** at `docs/features/<domain>/<feature-id>/TASKS.md` with the dependency-ordered breakdown.
8. **Update FEATURE-INDEX.md** with the task count.

## Sizing Rules

Split further if a task requires:
- Understanding many unrelated modules
- Major schema redesign
- Several independent behavioral changes
- Extensive cross-component modification

Do NOT create one-line microtasks. Each task should form a useful, reviewable unit of work.

## Output

- `TASKS.md` — ordered task list with dependencies
- `tasks/<TASK-ID>.md` — one file per atomic task
- Updated task count in `FEATURE-INDEX.md`
