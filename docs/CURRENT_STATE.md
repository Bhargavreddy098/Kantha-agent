# Current Development State

**Updated 2026-11-21** · [Development guide](README.md) · [Architecture Overview](architecture/overview.md) · [Technology Stack](technology/STACK.md)

Kantha is an autonomous, high-performance, local-first AI coding assistant and daemon workbench modeled on modern assistants (OpenCode, Cursor, Claude Code). The legacy manual access token login screens and cloud database dependencies have been eliminated in favor of **Automatic Local Session Authentication** ([ADR-007](decisions/ADR-007-automatic-local-session-authentication.md)), **strict Host/Origin fencing**, and **automatic workspace discovery**.

The Web Workbench is implemented in `apps/web` as a clean React 19 SPA communicating with the Bun daemon over local loopback HTTP, SSE, and WebSockets.

---

## 1. Architecture Baseline

| Question | Current Answer |
| :--- | :--- |
| **What is the architecture baseline?** | [Technology Stack Specification](technology/STACK.md), [Runtime Topology](technology/RUNTIME-TOPOLOGY.md), [Database Strategy](technology/DATABASE-STRATEGY.md), and [Monorepo Code Structure](code-structure.md). |
| **What is the runtime & monorepo stack?** | **Turborepo + Bun** monorepo, **Bun v1.4+** daemon runtime, **Effect-TS (`effect` + `HttpApi` + `Schema`)**, **Vercel AI SDK + Custom Effect Harness (OpenCode V2)**, **bun:sqlite + Drizzle ORM + JSONL** persistence, **Vite + React 19 + TanStack Router/Query + Astryx** SPA, and **React Ink** CLI. |
| **How is onboarding & authentication handled?** | **Automatic Local Session Authentication ([ADR-007](decisions/ADR-007-automatic-local-session-authentication.md))**: Zero manual login prompts or token entry. The daemon generates in-memory session authority and an ephemeral single-use **Pairing Ticket** (`#ticket=...`), which the browser SPA exchanges for an `HttpOnly`, `SameSite=Strict`, port-scoped cookie (`kantha_session_<port>`). All REST, SSE, and WebSocket PTY endpoints enforce fail-closed Host validation, strict Origin checks, and pre-upgrade WebSocket authentication. |
| **What is the state of the Desktop Shell?** | Deferred to a later phase (Tauri v2 will wrap the compiled Vite SPA once daemon and web core stabilize). |
| **Which approvals are open?** | SDD Gate 2 Technology Stack and Architecture Specifications approved for planning. |

---

## 2. Authentication & Ingress Status (ADR-007)

### Implemented Functionality
- **In-Memory Session Store**: Fresh cryptographic session authority per daemon instance; restarting the daemon immediately purges active sessions.
- **Atomic Pairing Ticket Registry**: 60-second TTL single-use pairing tickets with atomic delete-on-read lookups, preventing replay and concurrent pairing races.
- **Fragment Delivery & Purge**: Initial browser launch URL delivers ticket via `#ticket=...` fragment; the SPA extracts it and immediately purges the fragment via `history.replaceState({}, '', '/')` before issuing the exchange POST request.
- **Dual Ingress Fencing**: Fail-closed `Host` header check defeats DNS rebinding; strict `Origin` header validation blocks cross-site browser requests; `Sec-Fetch-Site: cross-site` requests are rejected.
- **Port-Scoped Cookie**: Sets `kantha_session_<port>` with `HttpOnly`, `SameSite=Strict`, and conditionally `Secure`.
- **Pre-Upgrade WebSocket Security**: Validates Host, Origin, and session cookie before completing WebSocket upgrade; invalidates and forcefully terminates active WebSockets (close code `4001`) upon session expiry.
- **Protected CLI Credential Transport**: `~/.kantha/daemon_<port>.token` created with exclusive mode and restrictive OS permissions (`0600` on POSIX, restricted user ACLs on Windows), verified using `crypto.timingSafeEqual`.
- **Non-Destructive Reconnection UX**: Web Workbench preserves prompt drafts and UI state across daemon restarts, presenting an inline reconnection banner.

### Automated Test Coverage
- **Autonomous Harness Runner & Gateway Integration (Milestone 1 100% Complete)**:
  - Multi-turn autonomous step loop in `EffectHarnessRunner` executing tools (`write_file`, `read_file`, `list_files`, `execute_command`) with ancestor-aware filesystem containment via `resolveSafeWorkspacePath`.
  - Option B Strict Block on Tier 4 models (`TIER4_TOOLS_BLOCKED`) guarding against tool misuse unless explicitly opted-in via `allowTier4Tools: true`.
  - Doom-loop guard detecting and halting execution upon 3 consecutive identical failing tool invocations.
  - Interruptible fiber step loop managed with Effect `Scope`, auto-cancelling pending approvals and marking sessions `interrupted` upon abort or termination.
  - Scoped durable intent persisted as `action_${runId}_${callId}` before dispatching mutations.
  - Gated mutations via `ApprovalManager` using Effect `Deferred` suspension, SQLite `approvals` state tracking (`pending`, `approved`, `rejected`, `timed_out`, `cancelled`), and a 10-minute timeout.
  - REST Session Endpoints: `POST /api/sessions/:id/prompt` (with synchronous 409 Conflict guard on running fibers and 400 validation), `GET /api/sessions/:id/approvals`, `POST /api/sessions/:id/approvals/:approvalId`, and `POST /api/sessions/:id/abort`.
  - Crash-safe reboot sweep clearing interrupted running sessions and cancelling dangling approvals on daemon startup.
  - Verified live end-to-end against `https://api.cent-ai.dev/v1` model `hy4-flash:free` autonomously creating workspace files, persisting 5 step checkpoints, recording 400+ session events, and settling usage ledger rows.
- **Gateway & Upstream Provider Streaming (Phase 1 100% Complete)**:
  - `@kantha/gateway` package fully implemented with 5 Effect ports (`VaultStore`, `ProviderStore`, `UsageLedgerStore`, `CatalogCacheStore`, `MasterKeyProvider`).
  - Upstream provider streaming powered by `@ai-sdk/openai-compatible`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, and `@ai-sdk/google` wrapped with `createQuirksFetch` (pre-flight SSRF enforcement, disabled redirects, body encoding and header quirks).
  - Hardened SSE lifecycle in `/api/chat/stream` with pre-flight status mapping (HTTP 402/404/500 JSON), immediate `res.flushHeaders()`, mid-flight error chunk handling, 15s SSE comment heartbeats (`: ping\n\n`) cleared cleanly via `Effect.ensuring(res.end())`, and client disconnect detection attached to `res.on("close")` guarded by `!res.writableEnded`.
  - Non-blocking ledger settlement in `packages/gateway/src/service.ts` bounded by `Effect.timeout("2 seconds")` and `Effect.catchAll`, guaranteeing stream finalizers never hang or raise defects.
  - Windows master key security in `apps/daemon/src/services/gateway/key-provider.ts` using direct `icacls` invocation via `child_process.execFileSync` and `os.userInfo().username` granting `:(R,W)` permissions on new and existing keys.
  - Settings UI CRUD (`/api/providers*`) fully migrated to encrypted `VaultService` with versioned AES-256-GCM ciphertext in SQLite `gateway_secrets`, preserving existing secrets on metadata-only edits, deleting secrets on provider removal, and performing atomic, crash-safe boot migration from `providers.json` using `.tmp` + `renameSync`.
  - Verified live end-to-end against `https://api.cent-ai.dev/v1` model `hy4-flash:free` with real-time reasoning, text streaming, and SQLite `usage_ledger` persistence.
- **Test Suites Across Monorepo**:
  - `@kantha/gateway`: 38 passing tests across 13 files (`gateway-service.test.ts`, `anthropic.test.ts`, `compatible.test.ts`, `interruption.test.ts`, `service.test.ts`, `tiers.test.ts`, `ssrf.test.ts`, `timeouts.test.ts`, `calculator.test.ts`, `finalizer.test.ts`, `ports.test.ts`, `cipher.test.ts`, `service.test.ts`).
  - `@kantha/daemon`: 21 passing tests across 3 files (`chat.test.ts`, `providers-vault.test.ts`, `key-provider.test.ts`).
  - `@kantha/web`: 14 passing tests (`chatDb.test.ts`, etc.).
  - Security suite: 16 passing tests (`security.test.ts`).
  - Monorepo typechecking: 100% clean (`pnpm run -r typecheck` with 0 errors across all 7 packages and apps).
- **Security Suite**: 16 automated security and regression tests in [apps/daemon/src/api/auth/__tests__/security.test.ts](../apps/daemon/src/api/auth/__tests__/security.test.ts) covering unauthenticated REST/SSE rejection, DNS rebinding, cross-origin drive-bys, ticket reuse/expiry/concurrency, cookie attributes, daemon restarts, CLI token timing safety, pre-upgrade PTY rejection, and active WebSocket termination.
- **Swiss AI Chat Suite**: 14 automated tests covering chat history categorization and title generation ([apps/web/src/db/__tests__/chatDb.test.ts](../apps/web/src/db/__tests__/chatDb.test.ts)), SSE streaming reasoning extraction ([apps/daemon/src/api/__tests__/chat.test.ts](../apps/daemon/src/api/__tests__/chat.test.ts)), and in-memory document extraction ([apps/daemon/src/api/__tests__/documents.test.ts](../apps/daemon/src/api/__tests__/documents.test.ts)). Total test suite: 30 passing tests.
- **Web Workbench Architecture**: `apps/web` implemented as a production-grade Swiss International AI Chat application built with Astryx Design components (`@astryxdesign/core`, `@astryxdesign/theme-neutral`). Features a true full-height sidebar with pinned Settings trigger, an accessible Astryx Settings Modal dialog (`SettingsDialog.tsx`), a floating premium composer with an integrated Astryx `DropdownMenu` model selector, local-first Dexie IndexedDB storage, and real-time streaming with visible reasoning.
- **Daemon Ingress & Multi-Model Ingress**: Ingress fencing updated with explicit loopback development port recognition (3000-3010, 5173-5180, 4173) and `KANTHA_ALLOWED_ORIGINS` support, eliminating `Unauthorized Origin` errors for Vite clients while preserving strict fail-closed DNS rebinding and cross-origin protection. Multi-model routing in `/api/chat/stream` seamlessly maps requests to OpenAI, Anthropic, or local Ollama endpoints.
- **Automated Test Coverage**: 16 unit tests covering Ingress Fencing (`fencing.test.ts`), chat history categorization and title generation (`chatDb.test.ts`), SSE streaming reasoning extraction (`chat.test.ts`), and in-memory document extraction (`documents.test.ts`).
- **Static Verification**: Full monorepo typechecking passes cleanly (`tsc --noEmit` on web and daemon with 0 errors).
- **Build Verification**: Production web bundle compiles cleanly into `apps/web/dist` (`vite build` succeeded with Astryx core and neutral theme stylesheets).

### Actual End-to-End Verification
- **Verified in Environment**: Local HTTP REST, SSE event streaming, WebSocket pre-upgrade rejection, atomic ticket consumption, and timing-safe CLI authentication verified via executable tests.
- **Unverified Scenarios**: Physical browser multi-tab cookie handling in Safari/WebKit; cross-platform validation on native Linux (cgroups/systemd) and macOS environments (current test harness ran on Windows 11).

### Outstanding Production-Readiness Risks
1. **P1 — Effect HttpApi Daemon Migration**: The daemon currently uses native Node `http.createServer` and `ws.WebSocketServer` as an intermediate implementation. Full architectural migration to `@effect/platform-bun` `HttpApi` remains outstanding.
2. **P2 — Process Lifecycle Supervision**: PTY subprocesses and git status executions currently execute via direct child process APIs rather than Effect `Scope`, requiring migration to ensure zero zombie processes under abnormal termination.
3. **P2 — Centralized Wire Protocol Schemas**: Client workspace and session interfaces in `apps/web` are currently declared locally rather than imported from `@kantha/protocol` Effect Schemas.
