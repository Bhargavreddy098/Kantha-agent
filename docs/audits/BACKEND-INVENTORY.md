# Backend Dependency & File Inventory

**Status:** AUDIT COMPLETE  
**Date:** 2026-11-21  
**Auditor:** Principal TypeScript Architect, Backend Engineer & AI Agent Runtime Architect  
**Scope:** `src/lib/gateway/`, `src/lib/harness/`, `src/lib/chat/`, `src/app/api/`, `src/instrumentation.ts`  

---

## 1. Executive Summary

This inventory audits **102 backend-related files** across the Kantha repository. The audit evaluates every module against actual imports, runtime callers, test scripts, environment variables, and architectural boundaries.

### High-Level Inventory Breakdown

| Domain | Total Files | Active / Essential | Refactor / Move | Duplicated / Overlapping | Dead / Obsolete Candidates |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Gateway Contracts** (`src/lib/gateway/contracts/`) | 15 | 15 | 0 | 0 | 0 |
| **Gateway Server** (`src/lib/gateway/server/`) | 14 | 11 | 2 (Computer, ChatInput) | 1 (`submitSessionRun`) | 0 |
| **Gateway Providers** (`src/lib/gateway/providers/`) | 9 | 6 | 3 (Orgo, ComputerInf, Prompt) | 0 | 0 |
| **Gateway Runs** (`src/lib/gateway/runs/`) | 3 | 3 | 0 | 0 | 0 |
| **Gateway Fixtures** (`src/lib/gateway/fixtures/`) | 5 | 0 | 5 (Move to `tests/fixtures/`) | 0 | 0 |
| **Gateway Client & Rules** | 2 | 2 | 0 | 0 | 0 |
| **Harness Core & Engine** (`src/lib/harness/`) | 16 | 10 | 4 (Computer, RouteErr, Client, Fixture) | 2 (Verify runners) | 0 |
| **Harness Sandbox** (`src/lib/harness/sandbox/`) | 5 | 5 | 0 | 0 | 0 |
| **Chat Persistence & Workers** (`src/lib/chat/`) | 4 | 2 (Queue, Worker) | 2 (Client store & attach) | 1 (Duplicated session) | 0 |
| **API Routes** (`src/app/api/`) | 28 | 21 | 1 (`/api/models`) | 4 (`/v1/*`, `/cancel`, `/sessions/.../runs`) | 2 (`/api/v1/*` proxy stubs) |
| **Server Instrumentation** | 1 | 1 | 0 | 0 | 0 |
| **Total** | **102** | **76** | **17** | **7** | **2** |

---

## 2. Comprehensive File Inventory

### 2.1 Gateway Subsystem (`src/lib/gateway/`)

#### Contracts (`src/lib/gateway/contracts/`)
| File | Purpose | Callers / Importers | Runtime Entry Point? | Classification | Rationale |
| :--- | :--- | :--- | :---: | :---: | :--- |
| `adapters.ts` | Interfaces for connection stores, secrets, and runs | `server/*`, `runs/*` | No | **KEEP** | Authoritative internal SPI contracts. |
| `approval.ts` | Types for approvals, states, decisions | `approval-service.ts`, `api/gateway/approvals/*` | No | **KEEP** | Human-in-the-loop approval data structures. |
| `chat.ts` | UIMessage and streaming chunk contracts | `chat-service.ts`, `types/chat.ts` | No | **KEEP** | AI SDK UI message serialization contracts. |
| `connection.ts` | Provider connection config and status | `connection-store.ts`, `api/gateway/connections/*` | No | **KEEP** | Provider connection definition. |
| `context.ts` | RequestContext (actor, workspace, requestId) | Ingress wrapper and all gateway services | No | **KEEP** | Fundamental security context contract. |
| `errors.ts` | GatewayError class and error envelope | All route handlers and server services | No | **KEEP** | Standardized error handling contract. |
| `event.ts` | Gateway SSE event types | `event-feed.ts`, `api/gateway/events/route.ts` | No | **KEEP** | Real-time event streaming schemas. |
| `health.ts` | Gateway status and readiness contracts | `lifecycle.ts`, `api/gateway/health/*` | No | **KEEP** | Health check schemas. |
| `index.ts` | Barrel export of all gateway contracts | Various components and services | No | **KEEP** | Clean public export surface. |
| `model.ts` | Model metadata and catalog schemas | `model-catalog.ts`, `api/chat/models` | No | **KEEP** | Model catalog contracts. |
| `run.ts` | GatewayRun and SubmitRunInput definitions | `session-service.ts`, `chat-service.ts` | No | **KEEP** | Authoritative run entity types. |
| `session.ts` | GatewaySession and SessionRecord contracts | `session-service.ts`, `api/gateway/sessions/*` | No | **KEEP** | Authoritative session entity types. |
| `usage.ts` | Two-phase attempt reservation and settlement contracts | `usage-service.ts`, `inference.ts` | No | **KEEP** | Strict financial/token ledger contracts. |
| `validation.ts` | Zod and manual request validators | API route handlers | No | **KEEP** | Boundary request validation. |

#### Server Modules (`src/lib/gateway/server/`)
| File | Purpose | Callers / Importers | Runtime Entry Point? | Classification | Rationale |
| :--- | :--- | :--- | :---: | :---: | :--- |
| `access.ts` | Workspace token verification & HttpOnly cookie management | `api/gateway/access/route.ts` | No | **KEEP** | Core authentication and session cookie issuing. |
| `approval-service.ts` | Manages human approval state transitions | `registry.ts`, `api/gateway/approvals/*` | No | **KEEP** | State management for pending approvals. |
| `capacity.ts` | Concurrency semaphores for inferences & SSE | `registry.ts`, `chat-service.ts` | No | **KEEP** | Server overload protection. |
| `chat-input.ts` | Normalizes and sanitizes chat input payloads | `chat-service.ts` | No | **REFACTOR** | Small helper; should be merged into `chat-service.ts` or validation. |
| `chat-service.ts` | Chat execution, streaming, and attempt accounting | `api/chat/route.ts`, `registry.ts` | No | **REFACTOR** | Contains dead `submitSessionRun` method; needs decoupling from Harness. |
| `computer-agent-service.ts` | Gateway service executing desktop automation | `api/gateway/computer-agent/route.ts`, `registry.ts` | No | **MOVE** | Belongs in `src/lib/integrations/computers/orgo/`. |
| `connection-store.ts` | Database operations for provider connections | `registry.ts`, `model-catalog.ts` | No | **KEEP** | Provider connection persistence. |
| `ingress.ts` | `withGatewayIngress` auth & validation wrapper | All `src/app/api/gateway/*` routes | No | **KEEP** | Authoritative ingress security boundary. |
| `lifecycle.ts` | Server readiness, draining, and status management | `registry.ts`, `instrumentation.ts` | No | **KEEP** | Process lifecycle control. |
| `public-connection.ts` | Sanitizes connection records for client responses | `api/gateway/connections/route.ts` | No | **KEEP** | Prevents secret leakage. |
| `registry.ts` | Central dependency injection container | All API routes, `instrumentation.ts` | No | **KEEP** | Server DI container and lifecycle singleton. |
| `secret-store.ts` | AES-GCM encrypted credential vault | `registry.ts`, `connection-store.ts` | No | **KEEP** | Secure key storage. |
| `usage-service.ts` | Two-phase reservation and settlement engine | `registry.ts`, `chat-service.ts`, `inference.ts` | No | **KEEP** | Core billing and budget enforcement. |
| `storage/database.ts` | SQLite database wrapper with serialized writes | `registry.ts`, test scripts | No | **KEEP** | Transactional database engine. |

#### Providers & Egress (`src/lib/gateway/providers/`)
| File | Purpose | Callers / Importers | Runtime Entry Point? | Classification | Rationale |
| :--- | :--- | :--- | :---: | :---: | :--- |
| `chat-prompt.ts` | Converts UIMessage history to model prompt format | `chat-service.ts` | No | **REFACTOR** | Format logic should be part of the inference adapter. |
| `computer-inference.ts` | Anthropic computer-use prompt & action parser | `computer-agent-service.ts` | No | **MOVE** | Belongs in `src/lib/integrations/computers/orgo/`. |
| `connection-test.ts` | Validates provider credentials against upstream APIs | `api/gateway/connections/[id]/test` | No | **KEEP** | Provider validation engine. |
| `egress.ts` | SSRF-safe outbound HTTP fetch proxy | `language-model.ts`, `connection-test.ts` | No | **KEEP** | Critical network security perimeter. |
| `language-model.ts` | AI SDK language model wrapper with egress proxy | `chat-service.ts` | No | **KEEP** | Upstream provider connection bridge. |
| `model-catalog.ts` | Model discovery, capabilities, and selection resolution | `registry.ts`, `chat-service.ts` | No | **KEEP** | Central model registry. |
| `orgo-computer.ts` | Orgo Cloud Computers REST API client | `computer-agent-service.ts` | No | **MOVE** | Belongs in `src/lib/integrations/computers/orgo/`. |
| `pricing.ts` | Model token pricing tables and cost calculators | `chat-service.ts`, `usage-service.ts` | No | **KEEP** | Financial calculation engine. |
| `provider-model-list.ts` | Fetches live model list from OpenAI/Anthropic | `model-catalog.ts`, `connection-test.ts` | No | **KEEP** | Remote model discovery. |

#### Runs & Event Feed (`src/lib/gateway/runs/`)
| File | Purpose | Callers / Importers | Runtime Entry Point? | Classification | Rationale |
| :--- | :--- | :--- | :---: | :---: | :--- |
| `event-feed.ts` | SSE subscription manager and event distributor | `registry.ts`, `api/gateway/events/route.ts` | No | **KEEP** | Real-time event publisher. |
| `session-service.ts` | GatewayRunService managing sessions and runs | `registry.ts`, `chat-service.ts`, `harness/service.ts` | No | **KEEP** | Public run identity and lease management. |
| `state.ts` | State machine transitions and session events | `session-service.ts`, `approval-service.ts` | No | **KEEP** | Transition rules and event formatting. |

#### Fixtures & Tests (`src/lib/gateway/fixtures/`)
| File | Purpose | Callers / Importers | Runtime Entry Point? | Classification | Rationale |
| :--- | :--- | :--- | :---: | :---: | :--- |
| `index.ts` | Fixtures barrel | `verify-fixtures.ts` | No | **MOVE** | Belongs in test infrastructure. |
| `payloads.ts` | Mock payloads for tests | `verify-fixtures.ts`, test scripts | No | **MOVE** | Pure test mock data in production source folder. |
| `scenarios.ts` | Test scenarios for rate limiting and failures | `verify-fixtures.ts` | No | **MOVE** | Pure test mock data in production source folder. |
| `seed-data.ts` | Database seed fixtures | `verify-fixtures.ts` | No | **MOVE** | Pure test mock data in production source folder. |
| `verify-fixtures.ts` | Fixture test assertions suite | `scripts/test-gateway-fixtures.mjs` | No | **MOVE** | Test runner file located inside `src/lib/`. |

---

### 2.2 Harness Subsystem (`src/lib/harness/`)

| File | Purpose | Callers / Importers | Runtime Entry Point? | Classification | Rationale |
| :--- | :--- | :--- | :---: | :---: | :--- |
| `AGENTS.md` | Invariant rules for Harness subsystem | AI coding agents | No | **KEEP** | Critical subsystem rules. |
| `client.ts` | Browser HTTP client calling Harness API | `harness-run-panel.tsx`, `use-harness-run.ts` | No | **MOVE** | Client-side HTTP code inside execution engine folder. Belongs in `@/lib/gateway/client` or `@/lib/client/`. |
| `computer-agent.ts` | Computer agent execution loop | `computer-agent-service.ts` | No | **MOVE** | Desktop automation loop; belongs in `src/lib/integrations/computers/`. |
| `contracts.ts` | Harness SPI contracts (`IHarnessStore`, etc.) | `runner.ts`, `service.ts`, `journal.ts` | No | **KEEP** | Foundational Harness SPI. |
| `create.ts` | Factory wiring Harness composition | `registry.ts` | No | **KEEP** | Harness DI composition. |
| `fixture.ts` | Mock workspace, verifier, and inference | `create.ts`, `verify-fixtures.ts` | No | **REFACTOR** | Separate test mocks from production composition default. |
| `gateway-adapter.ts` | Adapts Gateway DB to `IHarnessStore` | `create.ts` | No | **KEEP** | Clean boundary adapter between Gateway and Harness. |
| `index.ts` | Harness barrel export | External consumers | No | **KEEP** | Public interface definition. |
| `inference.ts` | H2 inference adapter with 2-phase ledger | `verify-inference.ts` | No | **KEEP** | Core inference adapter enforcing budget reservations. |
| `journal.ts` | Generation-fenced append-only journal | `runner.ts`, `service.ts`, `create.ts` | No | **KEEP** | Critical crash-recovery and fencing engine. |
| `route-error.ts` | Maps HarnessError to GatewayError | `api/gateway/harness/*` routes | No | **MOVE** | Gateway API concern, not Harness core engine. |
| `runner.ts` | Agent execution loop, tool dispatch, verification | `service.ts`, `create.ts` | No | **KEEP** | Heart of the native agent runtime. |
| `scenario.ts` | Fixture scenarios for scripted runs | `fixture.ts`, `harness-run-panel.tsx` | No | **REFACTOR** | UI references test scenarios directly; decouple production UI from test fixture. |
| `service.ts` | HarnessService managing submissions and runs | `api/gateway/harness/*`, `registry.ts` | No | **KEEP** | Harness boundary service. |
| `tokens.ts` | Token counting and estimation heuristics | `inference.ts` | No | **KEEP** | Context limit guarding. |
| `tools.ts` | Tool registry, output bounds (`capUtf8`), dispatch | `runner.ts`, `create.ts` | No | **KEEP** | Safe tool execution framework. |
| `verify-fixtures.ts` | Test suite for H0/H1 harness fixtures | `scripts/test-harness-fixtures.mjs` | No | **MOVE** | Test runner code located inside `src/lib/`. |
| `verify-inference.ts` | Test suite for H2 inference adapter | `scripts/test-h2-inference.mjs` | No | **MOVE** | Test runner code located inside `src/lib/`. |

#### Harness Sandbox (`src/lib/harness/sandbox/`)
| File | Purpose | Callers / Importers | Runtime Entry Point? | Classification | Rationale |
| :--- | :--- | :--- | :---: | :---: | :--- |
| `contracts.ts` | Sandbox, worktree, and path contracts | `path-guard.ts`, `worktree.ts` | No | **KEEP** | Sandbox boundary contracts. |
| `index.ts` | Sandbox barrel | External consumers | No | **KEEP** | Public interface. |
| `path-guard.ts` | Path traversal prevention and canonicalization | `worktree.ts`, test scripts | No | **KEEP** | Critical filesystem security boundary. |
| `stream-limiter.ts` | Output buffer bounding for process output | `worktree.ts`, test scripts | No | **KEEP** | Memory exhaustion protection. |
| `worktree.ts` | Ephemeral Git worktree isolation adapter | Test scripts, future executor | No | **KEEP** | Safe isolated repo execution. |

---

### 2.3 Chat Persistence & Processing (`src/lib/chat/`)

| File | Purpose | Callers / Importers | Runtime Entry Point? | Classification | Rationale |
| :--- | :--- | :--- | :---: | :---: | :--- |
| `attachments.ts` | Client attachment helpers and limits | `composer.tsx`, `chat-view.tsx` | No | **MOVE** | Pure client UI helper; belongs in `src/components/chat/` or `src/lib/client/`. |
| `document-queue.ts` | Background Node.js worker queue for uploads | `api/upload/route.ts` | No | **KEEP** | Server document ingestion worker manager. |
| `document-worker.mjs` | Worker thread extracting text from files | `document-queue.ts` (child thread) | Yes (Worker) | **KEEP** | Standalone worker script for file processing. |
| `store.ts` | Browser IndexedDB chat storage (`"use client"`) | `use-chat-stream.ts`, `use-conversations.ts` | No | **MOVE** | Client-only browser store located inside general `lib/`. Move to `src/lib/client/chat-db.ts`. |

---

### 2.4 API Routes (`src/app/api/`)

| Route Path | File | Purpose | Classification | Rationale & Evidence |
| :--- | :--- | :--- | :---: | :--- |
| `/api/chat` | `api/chat/route.ts` | AI SDK UI message stream endpoint | **KEEP** | Active frontend chat streaming endpoint. |
| `/api/chat/models` | `api/chat/models/route.ts` | Lists models decorated with connection labels | **KEEP** | Active endpoint called by `chat-workspace.tsx` and `use-ai-provider.ts`. |
| `/api/models` | `api/models/route.ts` | Raw model catalog listing | **MERGE** | Minor duplicate of `/api/chat/models`. Can be consolidated. |
| `/api/upload` | `api/upload/route.ts` | Handles file upload and text extraction | **KEEP** | Active multipart document upload handler. |
| `/api/v1/chat/completions` | `api/v1/chat/completions/route.ts` | Re-exports `/api/chat/route.ts` | **REMOVE_CANDIDATE** | Misleading name: returns AI SDK UI stream, NOT OpenAI completions protocol. |
| `/api/v1/models` | `api/v1/models/route.ts` | Re-exports `/api/models/route.ts` | **REMOVE_CANDIDATE** | Pure proxy re-export with no distinct consumers. |
| `/api/gateway/access` | `api/gateway/access/route.ts` | Token exchange and session cookies | **KEEP** | Essential authentication entry point. |
| `/api/gateway/approvals` | `api/gateway/approvals/route.ts` | List pending approvals | **KEEP** | Required for human-in-the-loop operator UI. |
| `/api/gateway/approvals/[id]` | `api/gateway/approvals/[id]/route.ts` | Submit approval decision | **KEEP** | Required for human-in-the-loop operator decisions. |
| `/api/gateway/computer-agent` | `api/gateway/computer-agent/route.ts` | Runs computer automation task | **MOVE** | Integration route; should be aligned with Orgo adapter. |
| `/api/gateway/connections` | `api/gateway/connections/route.ts` | CRUD provider connections | **KEEP** | Essential for managing LLM provider keys and endpoints. |
| `/api/gateway/connections/[id]` | `api/gateway/connections/[id]/route.ts` | Get, update, delete connection | **KEEP** | Essential connection management. |
| `/api/gateway/connections/[id]/discover` | `.../discover/route.ts` | Query live models from provider | **KEEP** | Used in Model Providers UI to discover models dynamically. |
| `/api/gateway/connections/[id]/test` | `.../test/route.ts` | Test connection credentials | **KEEP** | Used in Settings to verify API keys. |
| `/api/gateway/events` | `api/gateway/events/route.ts` | SSE real-time event stream | **KEEP** | Essential for push updates to the UI. |
| `/api/gateway/harness/recover` | `.../harness/recover/route.ts` | Recover interrupted harness runs | **KEEP** | Crash recovery endpoint for orphaned tasks. |
| `/api/gateway/harness/runs` | `.../harness/runs/route.ts` | Submit harness coding task | **KEEP** | Primary submission entry point for autonomous runs. |
| `/api/gateway/harness/runs/[id]` | `.../harness/runs/[id]/route.ts` | Read harness run snapshot/journal | **KEEP** | Authoritative projection view for Harness runs. |
| `/api/gateway/harness/runs/[id]/cancel` | `.../cancel/route.ts` | Cancel harness run | **MERGE** | Duplicates `/api/gateway/runs/[id]/cancel`. |
| `/api/gateway/health/live` | `api/gateway/health/live/route.ts` | Liveness health check | **KEEP** | Essential for deployment orchestrators (K8s/Docker). |
| `/api/gateway/health/ready` | `api/gateway/health/ready/route.ts` | Readiness health check | **KEEP** | Essential for zero-downtime deployments. |
| `/api/gateway/runs/[id]/cancel` | `api/gateway/runs/[id]/cancel/route.ts` | Cancel gateway run | **KEEP** | Unified run cancellation endpoint. |
| `/api/gateway/sessions` | `api/gateway/sessions/route.ts` | List and create gateway sessions | **KEEP** | Authoritative gateway session management. |
| `/api/gateway/sessions/[id]` | `api/gateway/sessions/[id]/route.ts` | Read and delete gateway session | **KEEP** | Authoritative gateway session management. |
| `/api/gateway/sessions/[id]/runs` | `.../sessions/[id]/runs/route.ts` | Submit run to existing session | **INVESTIGATE** | Uses stubbed `submitSessionRun` that aborts stream body immediately. |
| `/api/gateway/status` | `api/gateway/status/route.ts` | Gateway status and capacity | **KEEP** | System diagnostic and telemetry endpoint. |
| `/api/gateway/usage` | `api/gateway/usage/route.ts` | Workspace usage summary | **KEEP** | Authoritative billing and usage reporting. |

#### Instrumentation (`src/`)
| File | Purpose | Callers / Importers | Runtime Entry Point? | Classification | Rationale |
| :--- | :--- | :--- | :---: | :---: | :--- |
| `instrumentation.ts` | Server bootstrap and graceful shutdown hook | Next.js server runtime | Yes (Next.js Hook) | **KEEP** | Hooks `SIGTERM`/`SIGINT` for graceful database draining. |
