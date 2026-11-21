---
name: verify-feature
description: Check that completed subtasks integrate correctly and that the parent feature satisfies its specification. Use after all tasks for a feature are marked DONE.
---

# Verify Feature

## Purpose

Confirm that individually completed tasks integrate correctly and the parent feature specification is fully satisfied.

## Prerequisites

1. All tasks for the feature must be marked DONE in TASKS.md.
2. Read the feature SPEC.md for the full acceptance criteria.

## Workflow

1. **Verify all tasks are DONE**: Read TASKS.md and confirm every task has status DONE.
2. **Run integration checks**: Execute the testing strategy from SPEC.md.
3. **Verify acceptance criteria**: Walk through each acceptance criterion in the spec and verify it is met.
4. **Check non-functional requirements**: Verify security, performance, and observability expectations.
5. **Verify architectural boundaries**: Confirm the implementation respects the contracts and dependency direction from the architecture docs.
6. **Write verification report**: Create `docs/quality/<FEATURE-ID>-verification.md` with:
   - Each acceptance criterion and its pass/fail status
   - Test commands run and their results
   - Boundary violations found (if any)
   - Integration issues discovered (if any)
7. **Update FEATURE-INDEX**: Mark the feature status as VERIFIED or record blockers.

## Rules

- Do NOT fix issues found during verification—file new tasks
- Do NOT modify acceptance criteria to match the implementation
- Record ALL findings, including edge cases and known limitations
