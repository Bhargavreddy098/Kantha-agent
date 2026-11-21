# Current Development State

**Updated 2026-11-21** · [Development guide](README.md) · [Architecture Overview](architecture/overview.md) · [Technology Stack](technology/STACK.md)

Kantha is an autonomous, high-performance, local-first AI coding assistant and daemon workbench modeled on modern assistants (OpenCode, Cursor, Claude Code). The legacy manual access token login screens and cloud database dependencies have been eliminated in favor of **Automatic Local Session Authentication** ([ADR-007](decisions/ADR-007-automatic-local-session-authentication.md)), **strict Host/Origin fencing**, and **automatic workspace discovery**.

---

## 1. Architecture Baseline

| Question | Current Answer |
| :--- | :--- |
| **What is the architecture baseline?** | [Technology Stack Specification](technology/STACK.md), [Runtime Topology](technology/RUNTIME-TOPOLOGY.md), [Database Strategy](technology/DATABASE-STRATEGY.md), and [Monorepo Code Structure](code-structure.md). |
| **What is the runtime & monorepo stack?** | **Turborepo + Bun** monorepo, **Bun v1.4+** daemon runtime, **Effect-TS (`effect` + `HttpApi` + `Schema`)**, **Vercel AI SDK + Custom Effect Harness (OpenCode V2)**, **bun:sqlite + Drizzle ORM + JSONL** persistence, **Vite + React 19 + TanStack Router/Query + Tailwind v4 + Radix UI** SPA, and **React Ink** CLI. |
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
- **Security Suite**: 16 automated security and regression tests in [apps/daemon/src/api/auth/__tests__/security.test.ts](../apps/daemon/src/api/auth/__tests__/security.test.ts) covering unauthenticated REST/SSE rejection, DNS rebinding, cross-origin drive-bys, ticket reuse/expiry/concurrency, cookie attributes, daemon restarts, CLI token timing safety, pre-upgrade PTY rejection, and active WebSocket termination.
- **Static Verification**: Full monorepo typechecking passes cleanly (`tsc --noEmit` on all 6 packages/apps with 0 errors).
- **Build Verification**: Production web bundle compiles cleanly into `apps/web/dist`.

### Actual End-to-End Verification
- **Verified in Environment**: Local HTTP REST, SSE event streaming, WebSocket pre-upgrade rejection, atomic ticket consumption, and timing-safe CLI authentication verified via executable tests.
- **Unverified Scenarios**: Physical browser multi-tab cookie handling in Safari/WebKit; cross-platform validation on native Linux (cgroups/systemd) and macOS environments (current test harness ran on Windows 11).

### Outstanding Production-Readiness Risks
1. **P1 — Effect HttpApi Daemon Migration**: The daemon currently uses native Node `http.createServer` and `ws.WebSocketServer` as an intermediate implementation. Full architectural migration to `@effect/platform-bun` `HttpApi` remains outstanding.
2. **P2 — Process Lifecycle Supervision**: PTY subprocesses and git status executions currently execute via direct child process APIs rather than Effect `Scope`, requiring migration to ensure zero zombie processes under abnormal termination.
3. **P2 — Centralized Wire Protocol Schemas**: Client workspace and session interfaces in `apps/web` are currently declared locally rather than imported from `@kantha/protocol` Effect Schemas.
