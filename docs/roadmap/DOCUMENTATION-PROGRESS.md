# Documentation progress

**Status:** Active. This file tracks which documentation domains have been inspected, specified, and decomposed into tasks. Updated as documentation work progresses.

## Pass completion

| Pass | Description | Status | Coverage |
| --- | --- | --- | --- |
| A | Repository discovery and ownership inventory | ✅ Complete | Full source tree mapped; all existing docs read |
| B | Vision and architecture drafts | ✅ Complete | VISION.md created; architecture overview created |
| C | Global feature registry and dependencies | ✅ Complete | 35 features registered; dependency graph created |
| D | Gateway feature decomposition | ⏳ Pending | Gateway features identified but not yet decomposed into atomic tasks |
| E | Harness feature decomposition | 🔄 In Progress | HAR-005 fully decomposed (SPEC, TASKS, 4 atomic tasks); HAR-001–004, 006–014 pending |
| F | Integration, browser, security, infrastructure decomposition | ⏳ Pending | Features identified but not yet decomposed |
| G | Consistency validation, task sizing, implementation order | ⏳ Pending | Requires D–F completion |

## Document inventory

### SDD System Documents (Pre-Implementation Architecture Blueprint)

| Document | Path | Status |
| --- | --- | --- |
| Constitution | `CONSTITUTION.md` | Created — 9 immutable engineering articles |
| Product vision (Level 1) | `VISION.md` | Updated — Draft aligned with SDD Level 1 |
| Architecture Inventory & Gaps (Pass 1) | `docs/planning/architecture-inventory-and-gaps.md` | Created — Level 2 baseline & gap analysis |
| SDD Review & Readiness Matrix | `docs/planning/SDD-REVIEW.md` | Created — Gates 1–6 readiness tracking |
| Foundation: Product Requirements | `docs/00-foundation/product-requirements.md` | Created — 8 pillars, 6 NFRs |
| Foundation: Scope & Non-Goals | `docs/00-foundation/scope-and-non-goals.md` | Created — 4 release horizons & exclusions |
| Foundation: Domain Glossary | `docs/00-foundation/glossary.md` | Created — Canonical ubiquitous language |
| Foundation: Open Questions & Decisions | `docs/00-foundation/open-questions.md` | Created — D-01–D-08, G-01–G-03 decision briefs |

### Architecture & Specification Documents

| Document | Path | Status |
| --- | --- | --- |
| Product vision | `VISION.md` | Created — proposed draft |
| Architecture overview | `docs/architecture/overview.md` | Created |
| Gateway architecture | `docs/architecture/gateway.md` | Created |
| Harness architecture | `docs/architecture/harness.md` | Created |
| Contracts & interfaces | `docs/architecture/contracts.md` | Created |
| Execution lifecycle | `docs/architecture/execution-lifecycle.md` | Created |
| Security boundaries | `docs/architecture/security-boundaries.md` | Created |
| Feature index | `docs/roadmap/FEATURE-INDEX.md` | Created — 35 features |
| Dependency map | `docs/roadmap/DEPENDENCIES.md` | Created |
| Implementation order | `docs/roadmap/IMPLEMENTATION-ORDER.md` | Created |
| Documentation progress | `docs/roadmap/DOCUMENTATION-PROGRESS.md` | This file |
| Task template | `docs/roadmap/TASK-TEMPLATE.md` | Created |
| Current state | `docs/CURRENT_STATE.md` | Created |
| Root agent instructions | `AGENTS.md` | Reconciled & updated |
| Gateway agent rules | `src/lib/gateway/AGENTS.md` | Created |
| Harness agent rules | `src/lib/harness/AGENTS.md` | Created |
| Agent skill: plan-feature | `.agents/skills/plan-feature/SKILL.md` | Created |
| Agent skill: implement-task | `.agents/skills/implement-task/SKILL.md` | Created |
| Agent skill: resume-task | `.agents/skills/resume-task/SKILL.md` | Created |
| Agent skill: verify-feature | `.agents/skills/verify-feature/SKILL.md` | Created |
| Feature HAR-005 spec | `docs/features/harness/HAR-005-inference/SPEC.md` | Created (15 sections) |
| Feature HAR-005 tasks breakdown | `docs/features/harness/HAR-005-inference/TASKS.md` | Created |
| Task HAR-005-01 | `docs/features/harness/HAR-005-inference/tasks/HAR-005-01.md` | Created (READY) |
| Task HAR-005-02 | `docs/features/harness/HAR-005-inference/tasks/HAR-005-02.md` | Created (PLANNED) |
| Task HAR-005-03 | `docs/features/harness/HAR-005-inference/tasks/HAR-005-03.md` | Created (PLANNED) |
| Task HAR-005-04 | `docs/features/harness/HAR-005-inference/tasks/HAR-005-04.md` | Created (PLANNED) |

### Existing documentation reused

| Document | Path | Decision |
| --- | --- | --- |
| Root AGENTS.md | `AGENTS.md` | Retained — will be updated, not replaced |
| Architecture | `architecture.md` | Retained as authoritative root |
| Gateway README | `docs/gateway/README.md` | Retained — links OpenCode source map |
| Gateway contracts | `docs/gateway/CONTRACTS.md` | Retained — proposed boundary contracts |
| Gateway implementation plan | `docs/gateway/IMPLEMENTATION-PLAN.md` | Retained |
| Gateway system design | `docs/gateway/SYSTEM-DESIGN.md` | Retained |
| Gateway running | `docs/gateway/RUNNING.md` | Retained |
| OpenCode harness source map | `docs/gateway/OPENCODE-HARNESS.md` | Retained |
| Harness specification | `docs/harness/HARNESS.md` | Retained — shared behavior spec |
| Harness implementation plan | `docs/harness/IMPLEMENTATION-PLAN.md` | Retained — H0–H5 milestones |
| Harness sources | `docs/harness/SOURCES.md` | Retained |
| Harness UX | `docs/harness/UX.md` | Retained |
| Harness H0–H1 handoff | `docs/harness/HANDOFF-H0-H1.md` | Retained — fixture evidence |
| Harness H2 handoff | `docs/harness/HANDOFF-H2.md` | Retained — partial H2 evidence |
| Harness glossary | `docs/harness/GLOSSARY.md` | Retained |
| Feature: Approvals | `docs/harness/features/APPROVALS.md` | Retained — proposed contract |
| Feature: Chat events | `docs/harness/features/CHAT-EVENTS.md` | Retained — proposed contract |
| Feature: Context and skills | `docs/harness/features/CONTEXT-AND-SKILLS.md` | Retained — proposed contract |
| Feature: Inference | `docs/harness/features/INFERENCE.md` | Retained — proposed contract |
| Feature: Operations | `docs/harness/features/OPERATIONS.md` | Retained — proposed contract |
| Feature: Persistence | `docs/harness/features/PERSISTENCE.md` | Retained — proposed contract |
| Feature: Projection contract | `docs/harness/features/PROJECTION-CONTRACT.md` | Retained — proposed contract |
| Feature: Sessions | `docs/harness/features/SESSIONS.md` | Retained — proposed contract |
| Feature: Tools | `docs/harness/features/TOOLS.md` | Retained — proposed contract |
| Feature: Verification | `docs/harness/features/VERIFICATION.md` | Retained — proposed contract |
| Feature: Workspace | `docs/harness/features/WORKSPACE.md` | Retained — proposed contract |
| Feature map | `docs/harness/features/README.md` | Retained |
| Frontend README | `docs/frontend/README.md` | Retained |
| Glossary | `GLOSSARY.md` | Retained |
| Harness docs bundle | `harness-docs-bundle.md` | Retained — concatenated reference |

## Remaining work

### Pass D — Gateway feature decomposition
For each of GW-001 through GW-011:
1. Create `docs/features/gateway/GW-XXX-<name>/SPEC.md` with the 15-section template
2. Create `docs/features/gateway/GW-XXX-<name>/TASKS.md` with dependency-ordered breakdown
3. Create individual task files in `tasks/` subdirectory
4. Update task count in FEATURE-INDEX.md

**Priority:** GW-001 through GW-003 are prerequisites for harness work. GW-004 through GW-011 are largely existing code that needs specification but not new implementation.

### Pass E — Harness feature decomposition
For each of HAR-001 through HAR-014:
1. Same structure as Pass D
2. Focus first on HAR-005 (completing H2) since that is the critical path
3. Then HAR-009, HAR-010 (H3 — next milestone)

### Pass F — Integration, browser, infrastructure
- INT-001 through INT-003
- BRW-001 through BRW-005
- INF-001 through INF-004

### Pass G — Validation
- Cross-check task sizes against the sizing rules
- Verify no circular dependencies
- Confirm implementation order is consistent with dependency graph
- Check that every task has verifiable acceptance criteria

## Next documentation conversation instructions

```
1. Read docs/roadmap/DOCUMENTATION-PROGRESS.md (this file)
2. Read docs/roadmap/FEATURE-INDEX.md for the feature inventory
3. Pick the next incomplete pass (D, E, F, or G)
4. For task decomposition passes:
   a. Read the existing feature contract (docs/harness/features/*.md or docs/gateway/*.md)
   b. Inspect the source files referenced in FEATURE-INDEX
   c. Create SPEC.md, TASKS.md, and individual task files
   d. Update FEATURE-INDEX.md task counts
   e. Update this file with completion status
5. Save all work before stopping
6. Update CURRENT_STATE.md with what was done
```
