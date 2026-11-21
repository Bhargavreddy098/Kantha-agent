# Feature Registry

> Canonical index of every feature in the Kantha system.
> Each row links a feature ID to its architecture domain, source evidence, implementation status, and dependency chain.

---

## Table of Contents

- [Status Summary](#status-summary)
- [Gateway Features](#gateway-features)
- [Harness Features](#harness-features)
- [Integration Features](#integration-features)
- [Browser Features](#browser-features)
- [Infrastructure Features](#infrastructure-features)
- [Status Legend](#status-legend)

---

## Status Summary

| Status | Count |
|---|---|
| Existing code | 12 |
| Implemented (H0–H2) | 9 |
| Partial | 2 |
| Existing fixture | 1 |
| Proposed | 11 |
| In review | 1 |
| **Total** | **36** |

---

## Gateway Features

Domain documentation: [Gateway architecture](../gateway/README.md) · [Contracts](../gateway/CONTRACTS.md)

| ID | Name | Domain | Owner | Source Evidence | Tasks | Status | Dependencies |
|---|---|---|---|---|---|---|---|
| GW-001 | Authentication and workspace scope | [Gateway](../architecture/gateway.md) | Gateway | `src/lib/gateway/server/ingress.ts`, `src/lib/gateway/server/access.ts`, `src/app/api/gateway/access/route.ts` | Pending analysis | Existing code | — |
| GW-002 | Provider connections and model discovery | [Gateway](../architecture/gateway.md) | Gateway | `src/lib/gateway/server/connection-store.ts`, `src/lib/gateway/providers/`, `src/app/api/gateway/connections/` | Pending analysis | Existing code | GW-001 |
| GW-003 | Chat and streaming | [Gateway](../architecture/gateway.md) | Gateway | `src/app/api/chat/route.ts`, `src/lib/gateway/server/chat-service.ts` | Pending analysis | Existing code | GW-001, GW-002 |
| GW-004 | Session and run management | [Gateway](../architecture/gateway.md) | Gateway | `src/lib/gateway/runs/`, `src/app/api/gateway/sessions/` | Pending analysis | Existing code | GW-001 |
| GW-005 | Usage accounting and budgets | [Gateway](../architecture/gateway.md) | Gateway | `src/lib/gateway/server/usage-service.ts`, `src/app/api/gateway/usage/route.ts` | Pending analysis | Existing code | GW-001 |
| GW-006 | Event feed and SSE projections | [Gateway](../architecture/gateway.md) | Gateway | `src/lib/gateway/runs/event-feed.ts`, `src/app/api/gateway/events/route.ts` | Pending analysis | Existing code | GW-004 |
| GW-007 | Secret store and credential management | [Gateway](../architecture/gateway.md) | Gateway | `src/lib/gateway/server/secret-store.ts` | Pending analysis | Existing code | GW-001 |
| GW-008 | Gateway database and storage | [Gateway](../architecture/gateway.md) | Gateway | `src/lib/gateway/server/storage/database.ts` | Pending analysis | Existing code | — |
| GW-009 | Capacity and overload protection | [Gateway](../architecture/gateway.md) | Gateway | `src/lib/gateway/server/capacity.ts` | Pending analysis | Existing code | GW-008 |
| GW-010 | Health and readiness | [Gateway](../architecture/gateway.md) | Gateway | `src/app/api/gateway/health/`, `src/lib/gateway/server/lifecycle.ts` | Pending analysis | Existing code | GW-008 |
| GW-011 | Approval service (inert fixture) | [Gateway](../architecture/gateway.md) | Gateway | `src/lib/gateway/server/approval-service.ts`, `src/app/api/gateway/approvals/` | Pending analysis | Existing fixture | GW-004 |

---

## Harness Features

Domain documentation: [Harness feature map](../harness/features/README.md) · [Harness contract](../harness/HARNESS.md)

| ID | Name | Domain | Owner | Source Evidence | Tasks | Status | Dependencies |
|---|---|---|---|---|---|---|---|
| HAR-001 | Harness domain contracts | [Harness](../architecture/harness.md) | Harness | `src/lib/harness/contracts.ts` | Pending analysis | Implemented (H0–H1) | — |
| HAR-002 | HarnessJournal and durable state | [Harness](../architecture/harness.md) | Harness | `src/lib/harness/journal.ts` | Pending analysis | Implemented (H1) | HAR-001 |
| HAR-003 | HarnessRunner lifecycle | [Harness](../architecture/harness.md) | Harness | `src/lib/harness/runner.ts` | Pending analysis | Implemented (H1) | HAR-001, HAR-002 |
| HAR-004 | HarnessService and submission | [Harness](../architecture/harness.md) | Harness | `src/lib/harness/service.ts` | Pending analysis | Implemented (H1) | HAR-001, HAR-002, HAR-003 |
| HAR-005 | Gateway-mediated inference | [Harness](../architecture/harness.md) | Harness | `src/lib/harness/inference.ts` | [4 tasks (SPEC)](../features/harness/HAR-005-inference/TASKS.md) | Partial (H2 fixture) | HAR-001, GW-003, GW-005 |
| HAR-006 | Token estimation | [Harness](../architecture/harness.md) | Harness | `src/lib/harness/tokens.ts` | Pending analysis | Implemented (H2) | — |
| HAR-007 | Fixture tools and scenarios | [Harness](../architecture/harness.md) | Harness | `src/lib/harness/fixture.ts`, `src/lib/harness/scenario.ts`, `src/lib/harness/tools.ts` | Pending analysis | Implemented (H0–H1) | HAR-001 |
| HAR-008 | Gateway adapter | [Harness](../architecture/harness.md) | Harness | `src/lib/harness/gateway-adapter.ts`, `src/lib/harness/create.ts` | Pending analysis | Implemented (H1–H2) | HAR-001, GW-008 |
| HAR-009 | Context, skills and agent definitions | [Harness](../architecture/harness.md) | Harness | Proposed (H3) | Pending analysis | Proposed | HAR-003, HAR-005 |
| HAR-010 | Repository workspace and tools | [Harness](../architecture/harness.md) | Harness | Proposed (H3) | Pending analysis | Proposed | HAR-001, HAR-003 |
| HAR-011 | Verification and evidence | [Harness](../architecture/harness.md) | Harness | Proposed (H4) | Pending analysis | Proposed | HAR-003, HAR-010 |
| HAR-012 | Durable approval and recovery | [Harness](../architecture/harness.md) | Harness | Proposed (H4) | Pending analysis | Proposed | HAR-003, GW-011 |
| HAR-013 | Bounded repair | [Harness](../architecture/harness.md) | Harness | Proposed (H4) | Pending analysis | Proposed | HAR-011 |
| HAR-014 | Persistence and transcript portability | [Harness](../architecture/harness.md) | Harness | Proposed (H5) | Pending analysis | Proposed | HAR-002, GW-008 |
| HAR-015 | Orgo computer-use pilot | [Harness](../architecture/harness.md) | Harness | `src/lib/harness/computer-agent.ts` | [1 task](../features/harness/HAR-015-computer-agent/TASKS.md) | In review | GW-001, GW-002, GW-005, GW-008 |

---

## Integration Features

| ID | Name | Domain | Owner | Source Evidence | Tasks | Status | Dependencies |
|---|---|---|---|---|---|---|---|
| INT-001 | Gateway–Harness contracts and interfaces | [Integration](../architecture/integration.md) | Integration | `src/lib/harness/contracts.ts` (`IHarnessStore`, `IHarnessInference`, `IHarnessProjection`) | Pending analysis | Implemented (H1) | HAR-001 |
| INT-002 | Chat integration and run events | [Integration](../architecture/integration.md) | Integration | Proposed | Pending analysis | Proposed | GW-006, HAR-003 |
| INT-003 | Browser projection contract | [Integration](../architecture/integration.md) | Integration | Proposed | Pending analysis | Proposed | GW-006, HAR-003, INT-002 |

---

## Browser Features

| ID | Name | Domain | Owner | Source Evidence | Tasks | Status | Dependencies |
|---|---|---|---|---|---|---|---|
| BRW-001 | Chat UI and streaming | [Browser](../architecture/browser.md) | Browser | `src/app/chat/`, `src/components/chat/` | Pending analysis | Existing code | GW-003 |
| BRW-002 | Harness run panel | [Browser](../architecture/browser.md) | Browser | `src/components/harness/` | Pending analysis | Implemented (H1 fixture) | INT-002 |
| BRW-003 | Provider settings | [Browser](../architecture/browser.md) | Browser | `src/app/model-providers/`, `src/components/settings/` | Pending analysis | Existing code | GW-002 |
| BRW-004 | Repository task submission and history | [Browser](../architecture/browser.md) | Browser | Proposed | Pending analysis | Proposed | INT-003 |
| BRW-005 | Approval UI | [Browser](../architecture/browser.md) | Browser | Proposed | Pending analysis | Proposed | HAR-012, INT-003 |

---

## Infrastructure Features

| ID | Name | Domain | Owner | Source Evidence | Tasks | Status | Dependencies |
|---|---|---|---|---|---|---|---|
| INF-001 | Observability (OTel + SigNoz) | [Infrastructure](../architecture/infrastructure.md) | Infrastructure | `src/instrumentation.ts` | Pending analysis | Partial | — |
| INF-002 | PostgreSQL migration (Neon) | [Infrastructure](../architecture/infrastructure.md) | Infrastructure | Proposed (H5) | Pending analysis | Proposed | GW-008, HAR-014 |
| INF-003 | Release qualification suite | [Infrastructure](../architecture/infrastructure.md) | Infrastructure | Proposed (H5) | Pending analysis | Proposed | All HAR features |
| INF-004 | Deployment and staging | [Infrastructure](../architecture/infrastructure.md) | Infrastructure | Proposed | Pending analysis | Proposed | INF-001, INF-002 |

---

## Status Legend

| Value | Meaning |
|---|---|
| **Existing code** | Source files present in the working tree and exercised by the application. |
| **Existing fixture** | Source files present but operating on fixture/stub data only. |
| **Implemented (H _n_)** | Feature built and passing within the named harness horizon. |
| **Partial** | Some source exists; not all acceptance criteria are met. |
| **Proposed** | Documented in specs or contracts but no production source yet. |

> **Task counts** marked _Pending analysis_ will be populated when each feature is decomposed into its implementation plan.
