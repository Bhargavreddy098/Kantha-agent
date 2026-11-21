# Atomic Task Template

Use this structure for atomic task files in `docs/features/<domain>/<feature-id>/tasks/<TASK-ID>.md`. Sections can be combined when the result still identifies the outcome, dependencies, scope, invariants and acceptance evidence.

---

# Task: [TASK-ID] — [Brief Title]

### Task ID
`[DOMAIN-XXX-YY]` (e.g., `HAR-005-01`)

### Parent feature
`[DOMAIN-XXX]` — Link to `../SPEC.md`

### Objective
[One observable outcome and how it advances the parent feature. Keep it small enough for one focused implementation session.]

### Current implementation
[What source inspection proves already exists in the repository today. Cite files and line references where appropriate.]

### Dependencies
- Prior task IDs: `[TASK-ID]` (must be `DONE`)
- Required contracts: [Interfaces, types, or schemas that must be stable]
- Required decisions and environment: [Applicable approval, runtime or fixture setup, or None]

### Files to inspect
- `[path/to/file.ts]` — [Reason to inspect]
- `[path/to/docs.md]` — [Context or contract reference]

### Expected files to change
- `[path/to/file.ts]` — [Expected modification]
- `[path/to/new-file.ts]` — [New file to create]
*(If unknown, mark as: "Pending discovery during implementation")*

### Implementation scope
[Exact behavior to introduce or modify. Bounded to what is necessary for this task alone.]

### Out of scope
- [Explicit exclusion 1 to prevent uncontrolled scope expansion]
- [Explicit exclusion 2]
- [Unrelated refactors or adjacent feature implementations]

### Invariants
- [Guarantees about authorization, data consistency, or architectural boundaries that must remain intact]
- [Compatibility guarantees, e.g., existing chat stream format must not break]
- [One writer per session / generation fencing rules]

### Acceptance criteria
- [ ] 1. [Observable condition 1 establishing completion]
- [ ] 2. [Observable condition 2 establishing completion]
- [ ] 3. [Observable condition 3 establishing completion]

### Verification
```bash
# Executable test/verification commands with expected outcomes
[command 1]
[command 2]
```
Expected output: [Exact expected result or exit code]

### Definition of done
- [ ] Code changes implemented strictly within scope
- [ ] Invariants confirmed unbroken
- [ ] All verification commands pass with evidence captured
- [ ] All acceptance criteria checked
- [ ] Handoff written from the [template](../handoffs/TEMPLATE.md) and committed
- [ ] Current-state pointer updated and feature task list checked for dependency changes

### Status
`[PLANNED | READY | IN_PROGRESS | BLOCKED | IN_REVIEW | DONE]`

Use `PLANNED` during design and dependency work. Use `READY` when the scoped task and its prerequisites are in place. Use `BLOCKED` when work has stalled on a named dependency. Use `IN_REVIEW` when implementation exists and evidence, review or the required commit is pending.

### Handoff
Link to `docs/handoffs/[TASK-ID].md` (or `None` if not yet started)
