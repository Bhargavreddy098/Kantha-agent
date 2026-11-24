# Current Development State

**Updated 2026-11-24** · [Development guide](README.md) · [Architecture Overview](architecture/overview.md) · [Gateway Resilience](architecture/gateway-resilience.md) · [Harness Orchestrator](architecture/harness-orchestrator.md) · [Harness Tools](architecture/harness-tools.md)

Kantha is an autonomous, high-performance, local-first AI coding assistant and daemon workbench featuring a hardened multi-provider LLM gateway, a multi-phase autonomous harness orchestrator with 10 workspace-confined tools, **Automatic Local Session Authentication** ([ADR-007](decisions/ADR-007-automatic-local-session-authentication.md)), **strict Host/Origin fencing**, and a **Swiss International Style + Geist** Web Workbench built exclusively with **Astryx Design** components (`@astryxdesign/core`).

---

## 1. Architecture Baseline

| Area | Current Implementation |
| :--- | :--- |
| **Runtime & Persistence** | Node.js 22 (`tsx` + `node:sqlite` via `drizzle-orm/sqlite-proxy`, alongside `bun:sqlite` compatibility), Effect-TS runtime, SQLite + JSONL durable event log. |
| **Hardened Gateway (`@kantha/gateway`)** | Per-target `CircuitBreakerRegistry` (`closed`/`open`/`half_open`), deterministic error classification (`429`/`5xx`/timeouts/network vs `401`/`402`), exponential backoff honoring `Retry-After`, zero-duplicate model failover chains, AI SDK v7 `tool({ inputSchema: jsonSchema(...) })`, SSRF-guarded fetch with timeouts, OpenRouter attribution headers, and live `GET /api/gateway/health`. See [Gateway Resilience](architecture/gateway-resilience.md). |
| **OpenRouter Free-Tier Routing** | Curated tool-capable `:free` models (`openrouter/free`, `google/gemma-4-31b-it:free`, `google/gemma-4-26b-a4b-it:free`, `nvidia/nemotron-3.5-lightning:free`, `nvidia/nemotron-3-ultra-550b-a55b:free`, `inclusionai/ling-3.2-flash:free`) defaulted automatically when `OPENROUTER_API_KEY` is configured, backed by automatic 3-model free failover chains. |
| **Multi-Phase Harness Orchestrator** | Structured **Plan → Execute → Verify** orchestrator (`apps/daemon/src/harness/orchestrator.ts` + `runner.ts`) with parallel read-only tool batching, sequential approval-gated writes (`ApprovalManager` emitting immediate `approval_required` SSE), durable `tool_intent` (`action_${runId}_${callId}`), spec-compliant multi-turn `toolCalls`/`toolResults` history, 64KB character-budget context compaction, doom-loop guard, and Tier 4 guard. See [Harness Orchestrator](architecture/harness-orchestrator.md). |
| **10-Tool Workspace Suite** | `inspect_workspace`, `read_file` (with line slicing), `list_files` (recursive/depth), `write_file`, `edit_file`, `delete_file`, `glob_files`, `grep_search`, `git_status` (no shell interpolation), and `execute_command` (destructive-command blocklist + 32KB output caps + timeout tree kill), exposed via `GET /api/harness/tools`. See [Harness Tools](architecture/harness-tools.md). |
| **Web Workbench (`apps/web`)** | **Swiss International Typographic Style** paired with **Geist** & **Geist Mono** typography and **Astryx Design (`@astryxdesign/core`) components only**. Includes three first-class modes via Astryx `TopNav` + `SegmentedControl`: **Chat**, **Harness** (live plan `Stepper`, `ChatToolCalls`, inline approval `Banner`s, step budget `ProgressBar`, `Switch` auto-approve toggle), and **Inspector** (live gateway circuit breakers, ledger rollups, and 10-tool JSON schema browser). |

---

## 2. Authentication & Ingress Status (ADR-007)

### Implemented Functionality
- **In-Memory Session Store**: Fresh cryptographic session authority per daemon instance; restarting the daemon immediately purges active sessions.
- **Atomic Pairing Ticket Registry**: 60-second TTL single-use pairing tickets with atomic delete-on-read lookups, preventing replay and concurrent pairing races.
- **Fragment Delivery & Purge**: Initial browser launch URL delivers ticket via `#ticket=...` fragment; the SPA extracts it and immediately purges the fragment via `history.replaceState({}, '', '/')` before issuing the exchange POST request.
- **Dual Ingress Fencing**: Fail-closed `Host` header check defeats DNS rebinding; strict `Origin` header validation blocks cross-site browser requests; `Sec-Fetch-Site: cross-site` requests are rejected.
- **Port-Scoped Cookie**: Sets `kantha_session_<port>` with `HttpOnly`, `SameSite=Strict`/`SameSite=Lax`, and `SameSite=None; Secure` under HTTPS preview iframes.
- **Pre-Upgrade WebSocket Security**: Validates Host, Origin, and session cookie before completing WebSocket upgrade; invalidates and forcefully terminates active WebSockets (close code `4001`) upon session expiry.
- **Protected CLI Credential Transport**: `~/.kantha/daemon_<port>.token` created with exclusive mode and restrictive OS permissions (`0600` on POSIX, restricted user ACLs on Windows), verified using `crypto.timingSafeEqual`.
- **Non-Destructive Reconnection UX**: Web Workbench preserves prompt drafts and UI state across daemon restarts.

### Automated Test Coverage
- **Gateway Resilience & Circuit Breakers**: Unit tests in `packages/gateway/src/resilience/__tests__/circuit-breaker.test.ts` verifying error classification, `Retry-After` backoff, `closed` → `open` → `half_open` → `closed` transitions, and latency EMA/failover snapshots.
- **Harness Orchestrator & 10-Tool Suite**: Unit tests in `apps/daemon/src/harness/__tests__/orchestrator.test.ts`, `tools.test.ts`, and `runner.test.ts` verifying Plan → Execute → Verify transitions, parallel read vs. sequential write partitioning, context compaction, multi-turn `toolCalls`/`toolResults` persistence, path traversal/symlink containment, destructive command blocking, Tier 4 guard, and doom-loop detection.
- **Gateway & Upstream Provider Streaming**:
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
