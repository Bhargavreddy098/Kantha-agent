# Implementation order

The [Harness implementation plan](../harness/IMPLEMENTATION-PLAN.md) defines milestone exit criteria. The [dependency map](DEPENDENCIES.md) shows feature relationships. Open [Current state](../CURRENT_STATE.md) for the resume pointer and the [SDD review](../planning/SDD-REVIEW.md) for production sign-off.

## Current workstreams

- **Computer-use pilot** tracks [HAR-015-01](../features/harness/HAR-015-computer-agent/tasks/HAR-015-01.md). It uses an existing Orgo desktop with an authenticated Gateway owner and does not depend on repository sandbox qualification.

- **H2 release qualification** starts with [HAR-005-01](../features/harness/HAR-005-inference/tasks/HAR-005-01.md). The fixture seam has evidence. Live provider, persistent hosting and recovery checks are still open.
- **HAR-010 sandbox groundwork** starts with the recorded [HAR-010-01 fixture evidence](../handoffs/HAR-010-01.md). [HAR-010-02](../features/harness/HAR-010-kiri-sandbox/tasks/HAR-010-02.md) is the next planning item for that workstream. See the [sandbox task list](../features/harness/HAR-010-kiri-sandbox/TASKS.md) for driver and integration prerequisites. Production repository effects require H2 qualification and the applicable H3 and H4 exit criteria.

### Phase: Complete H2

| Order | Feature | Task | Prerequisites | Status |
| --- | --- | --- | --- | --- |
| 1 | HAR-005 | [Qualify live provider adapter](../features/harness/HAR-005-inference/tasks/HAR-005-01.md) | H2 fixtures and applicable sign-off | See task |
| 2 | HAR-005 | [Verify live tool round trip and call correlation](../features/harness/HAR-005-inference/tasks/HAR-005-02.md) | HAR-005-01 | See task |
| 3 | HAR-005 | [Qualify persistent hosting and graceful shutdown](../features/harness/HAR-005-inference/tasks/HAR-005-03.md) | HAR-005-02 | See task |
| 4 | HAR-005 | [Verify worker-kill reconciliation and usage settlement](../features/harness/HAR-005-inference/tasks/HAR-005-04.md) | HAR-005-03 | See task |

### Phase: H3 — Context, skills, and repository tools

The entries below are roadmap slices. Give each an atomic task file before implementation. HAR-010’s production workspace and tool profile also consumes the sandbox groundwork.

| Order | Feature | Task | Prerequisites | Status |
| --- | --- | --- | --- | --- |
| 5 | HAR-010 | First production workspace profile: scoped read/search/patch tools | H2 complete | PLANNED |
| 6 | HAR-010 | Executor boundary: path resolution, capability enforcement, bounded output | Task 5 | PLANNED |
| 7 | HAR-009 | Agent definition and fixture profiles | H2 complete | PLANNED |
| 8 | HAR-009 | Repository instruction resolution (root AGENTS.md, nested scoping) | Task 7 | PLANNED |
| 9 | HAR-009 | Skill discovery and scoped load | Task 8 | PLANNED |
| 10 | HAR-009 | Context budget, compaction, and restart | Tasks 8, 9 | PLANNED |

### Phase: H4 — Verification and approval

| Order | Feature | Task | Prerequisites | Status |
| --- | --- | --- | --- | --- |
| 11 | HAR-011 | Free-text acceptance planning and criterion pinning | H3 complete | PLANNED |
| 12 | HAR-011 | Isolated predefined check execution and evidence artifacts | Task 11 | PLANNED |
| 13 | HAR-012 | Durable approval lifecycle: persist pending, resume on decision | Task 11 | PLANNED |
| 14 | HAR-013 | Bounded repair loop: failed check → repair attempt → recheck | Tasks 12, 13 | PLANNED |
| 15 | HAR-012 | Operator disposition for unresolved effects | Task 13 | PLANNED |

### Phase: H5 — Release qualification

| Order | Feature | Task | Prerequisites | Status |
| --- | --- | --- | --- | --- |
| 16 | HAR-014 | PostgreSQL adapter qualification (Neon) | H4 complete | PLANNED |
| 17 | INF-001 | OTel instrumentation and SigNoz export | Can start alongside H3 | PLANNED |
| 18 | INF-003 | Repository evaluation suite: scripted episodes and regression cases | H4 complete | PLANNED |
| 19 | INF-003 | Cross-repository reliability (A9) | Task 18 | PLANNED |
| 20 | INF-004 | Staging deployment and rollout | Tasks 16, 17, 18 | PLANNED |

## Rules

- Never schedule a task whose prerequisites are incomplete.
- Update the relevant task and current-state pointer when work changes. Update this file when sequencing or dependencies change.
- Use the task file for scope and verification. Each task should link to its parent specification in `docs/features/`.
