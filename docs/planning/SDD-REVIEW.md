# Specification-Driven Development (SDD) Review & Readiness Matrix

**Status:** ACTIVE GOVERNANCE  
**Last Updated:** 2026-11-21  
**Lead Architect:** Principal Software Architect & SDD Specialist  
**Governing Standard:** GitHub Spec Kit + OpenClaw Ownership + arc42 Completeness

Use the [current-state page](../CURRENT_STATE.md) for the resume pointer and current fixture evidence. The [HAR-010 task plan](../features/harness/HAR-010-kiri-sandbox/TASKS.md) records sandbox planning and predecessor evidence added after the pass summaries below. Pending approvals in this review still apply.

---

## 1. Pre-Implementation Quality Gates

No feature or subtask may proceed to production application implementation until its prerequisite governance gates are formally reviewed and signed off.

```
[Gate 1: Vision & Constitution] ────► PENDING HUMAN APPROVAL
              │
[Gate 2: System Architecture]   ────► READY FOR REVIEW (Pass 1 Complete)
              │
[Gate 3: Feature Requirements]  ────► IN PROGRESS (HAR-005 Drafted; Others Pending)
              │
[Gate 4: Detailed Design]       ────► IN PROGRESS (HAR-005 Drafted; Shared Contracts Pending)
              │
[Gate 5: Verification Coverage] ────► IN PROGRESS (H0–H2 Fixtures Green; Live Suites Pending)
              │
[Gate 6: Atomic Tasks Ready]    ────► IN PROGRESS (HAR-005 Decomposed; Others Pending)
              │
              ▼
[Authoritative Implementation Greenlight] ───► BLOCKED PENDING GATES 1–4
```

---

## 2. Gate-by-Gate Readiness Tracking

| Gate | Scope | Status | Deliverables | Blocking Dependencies |
|---|---|---|---|---|
| **Gate 1: Vision & Constitution** | Level 1: System Purpose, Constitution Laws, Scope Boundaries, Non-Goals, Open Questions | **DRAFT COMPLETE** *(Awaiting Human Sign-off)* | `VISION.md`<br/>`CONSTITUTION.md`<br/>`docs/00-foundation/product-requirements.md`<br/>`docs/00-foundation/scope-and-non-goals.md`<br/>`docs/00-foundation/glossary.md`<br/>`docs/00-foundation/open-questions.md` | Human review and formal approval of Foundation Level. |
| **Gate 2: Architecture & Tech Approved** | Level 2: Component Ownership, Runtime Topology, Technology Specifications, Database Strategy, Sandbox Security, ADRs | **COMPLETE** *(Technology Suite Ready for Sign-off)* | `docs/technology/STACK.md`<br/>`docs/technology/DEPENDENCIES.md`<br/>`docs/technology/VERSION-COMPATIBILITY.md`<br/>`docs/technology/RUNTIME-TOPOLOGY.md`<br/>`docs/technology/DATABASE-STRATEGY.md`<br/>`docs/technology/EXECUTION-SANDBOX.md`<br/>`docs/technology/PROVIDER-INTEGRATION.md`<br/>`docs/technology/BUILD-AND-STYLING.md`<br/>`docs/technology/SECURITY-BOUNDARIES.md`<br/>`docs/technology/TESTING-STRATEGY.md`<br/>`docs/decisions/ADR-001` to `ADR-005` | Human sign-off on the 5 Architecture Decisions (ADR-001 through ADR-005). |
| **Gate 3: Requirements Complete** | Level 3: Feature-by-feature PRD, normal execution, invalid inputs, error behaviors, concurrency cases, cancellation | **PARTIAL** *(1 / 35 features specified)* | `docs/features/harness/HAR-005-inference/SPEC.md` (done)<br/>Remaining 34 features in `FEATURE-INDEX.md` pending. | Pass 4 & Pass 5 execution for remaining critical features. |
| **Gate 4: Detailed Design & Contracts** | Level 4: State machines, interface contracts, persistence schemas, error taxonomies, ADRs | **PARTIAL** *(Contracts defined in code, formal docs pending)* | `src/lib/harness/contracts.ts` (implemented)<br/>`docs/contracts/` (schemas to be populated in Pass 3) | Freezing shared contracts (`IHarnessStore`, `IHarnessInference`, `IHarnessProjection`). |
| **Gate 5: Verification Coverage** | Level 5: Acceptance scenarios, negative tests, crash recovery, fault injection, performance tests | **PARTIAL** *(H0–H2 fixtures green)* | `scripts/test-gateway-fixtures.mjs`<br/>`scripts/test-harness-fixtures.mjs`<br/>`scripts/test-h2-inference.mjs` | Test plan specifications for live provider and repository tools. |
| **Gate 6: Atomic Tasks Ready** | Level 6: Bounded tasks (≤5 files, 1 session), explicit criteria, verification commands | **PARTIAL** *(HAR-005-01 through 04 ready)* | `docs/features/harness/HAR-005-inference/TASKS.md`<br/>`docs/features/harness/HAR-005-inference/tasks/HAR-005-01.md` | Gates 1–4 sign-off before unlocking execution. |

---

## 3. Session Progress Summary (Pass 1 & Pass 2)

### Completed in Pass 1 (Architecture Inventory & Gap Analysis)
1. **System Boundaries & Actors:** Formally mapped Client, Gateway, Harness, Sandbox, Git Workspaces, AI Providers, and SigNoz OTel collector.
2. **State Sovereignty Matrix:** Documented single authoritative owners for all 12 system states.
3. **Execution Deep-Dive:** Documented inference mediation, per-attempt budgets, tool output bounding (8KB), generation-fenced leases (`assertClaim`), and durable intent (`pendingActionId`).
4. **Current Reality Audit:** Mapped verified existing code vs. fixtures/stubs vs. intended architecture vs. proposed changes.
5. **Architectural Gaps Catalog:** Documented decisions D-01 through D-08, plus newly identified gaps G-01 (SSE Reconnect), G-02 (Multi-file patch), and G-03 (Process kill propagation).

### Completed in Pass 2 (Vision & Constitution Drafts)
1. **`CONSTITUTION.md`:** Drafted universal repository governance with 9 non-negotiable articles:
   - Article I: Sovereign Ownership & Authority Invariant
   - Article II: State Integrity & Generation Fencing
   - Article III: Durable Intent & Crash Recoverability
   - Article IV: Deterministic Verification over Model Assertions
   - Article V: Strict Security Boundaries & Isolation Policy
   - Article VI: Specification-Driven Development Rigor
   - Article VII: Zero Knowledge Visibility Gap & Living Documentation
   - Article VIII: Frontend Component Reuse & UI Integrity
   - Article IX: Amendment & Governance
2. **`VISION.md`:** Sharpened Level 1 vision document covering personas, core journeys, 4-horizon roadmap, non-goals, and constraints.
3. **`docs/00-foundation/product-requirements.md`:** Detailed foundation PRD covering 8 functional pillars and 6 non-functional metrics.
4. **`docs/00-foundation/scope-and-non-goals.md`:** Rigorous horizon boundaries (Harness vs Orchestrator vs Plugins vs Automations).
5. **`docs/00-foundation/glossary.md`:** Canonical ubiquitous domain language definitions.
6. **`docs/00-foundation/open-questions.md`:** Full decision briefs for D-01 through D-08 and G-01 through G-03.

---

## 4. Next Planning Pass: Pass 3 (Architecture & Shared Contracts)

Upon human approval of Gate 1 (Foundation Level), the next planning session will execute **Pass 3: Architecture & Shared Contracts**:
1. Deepen `docs/architecture/` with comprehensive runtime sequence diagrams and state machine specifications.
2. Formalize shared interface contracts in `docs/contracts/`:
   - `docs/contracts/harness-ports.md` (`IHarnessStore`, `IHarnessInference`, `IHarnessProjection`, `IHarnessWorkspace`, `IHarnessVerifier`, `IToolRegistry`)
   - `docs/contracts/event-schemas.md` (Journal entry schemas, SSE event wire contracts)
   - `docs/contracts/api-contracts.md` (Gateway submission and approval HTTP endpoints)
   - `docs/contracts/error-taxonomy.md` (`HarnessErrorCode`, Gateway HTTP error mapping)
3. Formalize Architecture Decision Records (ADRs) for D-01 (Hosting) and D-02 (Postgres driver) in `docs/decisions/`.
