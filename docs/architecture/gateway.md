# Daemon API Gateway Architecture

**Status:** Canonical Target Architecture (Turborepo Monorepo)  
**Owner:** Daemon API Subsystem (`apps/daemon/src/api/`, `packages/protocol/`)

## 1. Overview and Responsibility

The Daemon API Gateway is the communication and control plane of Kantha, hosted within the **Bun v1.4+ Daemon process** using **Effect HttpApi (`@effect/platform-bun`)**:
- Exposes type-safe HTTP, WebSocket, and Server-Sent Events (SSE) endpoints.
- Validates all request and response payloads using **Effect Schema**.
- Manages session lifecycle, submission deduplication, and task admission into SQLite.
- Manages external AI provider egress via Vercel AI SDK, redacting sensitive keys and enforcing token budgets.
- Provides real-time SSE token streams and WebSocket bridges for interactive `@xterm/xterm` PTY sessions.
- Enforces human-in-the-loop approvals and handles cancellation signals.

## 2. Core Subsystems and Architecture

| Subsystem | Location | Key Responsibilities |
|---|---|---|
| **HttpApi Router** | `apps/daemon/src/api/router.ts` | Route matching, middleware, CORS, error handling with Effect tagged error channels. |
| **Session Service** | `apps/daemon/src/api/sessions.ts` | Session CRUD, prompt submission, idempotency check, mapping to local worktree. |
| **SSE Streaming Hub** | `apps/daemon/src/api/sse.ts` | Multi-subscriber `Effect Stream` streaming assistant reasoning tokens, step markers, and status. |
| **WebSocket PTY Bridge**| `apps/daemon/src/api/pty.ts` | Bi-directional streaming of ANSI terminal chunks between `bun-pty`/`Bun.Terminal` and clients. |
| **Approval Manager** | `apps/daemon/src/api/approvals.ts` | Manages pending tool approvals, yielding execution until explicit human authorization. |
| **Secret Store** | `apps/daemon/src/api/secrets.ts` | Local AES-256 encrypted credential vault for provider API keys. |

## 3. Communication Direction

```
[Web Workbench SPA (Vite + React 19)]    [Terminal CLI (React Ink)]
                     │                                │
                     └────────────────┬───────────────┘
                                      │ (HTTP / SSE / WebSocket)
                                      ▼
             [Effect HttpApi Router (apps/daemon/src/api/)]
                                      │
            ┌─────────────────────────┼─────────────────────────┐
            ▼                         ▼                         ▼
   [Local Database]          [Harness Engine]            [PTY Manager]
(bun:sqlite + Drizzle)     (Custom Effect Loop)     (Bun.Terminal / bun-pty)
```

**Rule:** Client applications (`apps/web` and `apps/cli`) import wire schemas and types exclusively from `packages/protocol`. They never import daemon internal server logic or database entities directly.
