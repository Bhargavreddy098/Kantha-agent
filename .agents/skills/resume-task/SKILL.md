---
name: resume-task
description: Reconstruct progress from documentation, git status, source code, and test evidence. Continue from the first unfinished step. Use when picking up work started in a previous conversation.
---

# Resume Task

## Purpose

Continue an in-progress task from exactly where the previous conversation left off, using only durable records.

## Prerequisites

1. Read `docs/CURRENT_STATE.md` for the active task and latest handoff.
2. Read the handoff file at `docs/handoffs/<TASK-ID>.md`.
3. Read the task file for the full specification.

## Workflow

1. **Read CURRENT_STATE.md** to identify the active task.
2. **Read the handoff** to understand what was completed and what remains.
3. **Verify the handoff claims** against actual repository state:
   - Check `git status` and `git diff` for uncommitted changes
   - Run the verification commands from the handoff to confirm reported results
   - Inspect the files listed as changed
4. **Identify the next action** from the handoff's "Next exact action" field.
5. **Continue implementation** from that exact point using the implement-task workflow.
6. **Write a new handoff** when done or when context is running out.

## Rules

- Do NOT trust handoff claims without verification
- Do NOT restart work that is already verified as complete
- Do NOT change the task scope based on discoveries—file a new task instead
- Always write a handoff before stopping, even if incomplete
