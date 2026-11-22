# Architecture Overview

Kantha is a local-first, autonomous AI coding workbench and daemon that executes, tests, and verifies software tasks in code repositories. It is built as a **Turborepo + Bun monorepo** with a decoupled architecture: an independent **Bun Daemon** running an **Effect-TS API & Custom Harness**, a **Web Workbench SPA** (Vite + React 19), and an optional **Terminal CLI** (React Ink).

---

## 1. Canonical Tech Stack

| Layer | Canonical Technology | Architectural Scope & Role |
|---|---|---|
| **Monorepo** | Turborepo + Bun Workspaces | Task pipelines, caching, and cross-package dependency orchestration. |
| **Daemon Runtime** | Bun `v1.4.0+` | Native high-speed runtime, native `bun:sqlite`, native WebSockets, sub-millisecond startup. |
| **Daemon API & Streaming** | Effect (`effect` + `HttpApi` + `Schema`) | Typed error channels, strict resource scopes (`Scope`), and schema-validated SSE/WS streaming. |
| **Coding Harness** | Vercel AI SDK + Custom Effect Harness (OpenCode V2) | Generation-fenced agent execution loop, interactive approval gates, and multi-provider model routing. |
| **PTY & File Watching** | Bun.Terminal (POSIX) / bun-pty (Windows) + ripgrep | Interactive terminal emulation (`@xterm/xterm`), instant file search, and change detection. |
| **Local Persistence** | `bun:sqlite` + Drizzle ORM + JSONL event log | Embedded WAL-mode SQLite database for relational state, paired with append-only JSONL files for event streams. |
| **Web Workbench UI** | Vite + React 19 + TanStack Router + TanStack Query + Astryx | Pure Single Page Application (SPA), zero SSR overhead, accessible Astryx components. |
| **Terminal CLI** | React Ink | Interactive terminal companion communicating with the daemon over local HTTP/SSE/WS. |
| **Desktop Shell** | *Deferred (Tauri v2)* | The Vite SPA is compiled statically to allow seamless embedding in Tauri v2 in a later milestone. |

---

## 2. Component Ownership & System Blueprint

```mermaid
flowchart TD
    subgraph Clients ["Presentation Layer"]
        WebClient["Web Workbench (Vite + React 19 SPA)"]
        CLIClient["Terminal CLI (React Ink TUI)"]
    end

    subgraph Daemon ["Kantha Daemon (Bun v1.4+ Process)"]
        APIGateway["Effect HttpApi & Streaming Hub"]
        Harness["Custom Effect Harness (Step Loop)"]
        AIBridge["Vercel AI SDK (Model Egress)"]
        PTYManager["Bun.Terminal / bun-pty Manager"]
        ToolExecutor["Tool & Sandbox Executor (ripgrep, git)"]
    end

    subgraph Storage ["Local-First Persistence"]
        SQLiteDB[("bun:sqlite + Drizzle ORM\n(~/.kantha/kantha.sqlite)")]
        JSONLFiles[("Append-Only JSONL Event Stream\n(~/.kantha/sessions/*.jsonl)")]
    end

    subgraph Providers ["AI Providers"]
        Anthropic["Anthropic (Claude 3.5 Sonnet)"]
        OpenAI["OpenAI (GPT-4o)"]
        LocalLLM["Local / Custom (Ollama, vLLM)"]
    end

    WebClient <-->|HTTP API & SSE Stream| APIGateway
    WebClient <-->|WebSocket (@xterm/xterm)| APIGateway
    CLIClient <-->|HTTP / SSE / WS| APIGateway

    APIGateway <--> Harness
    Harness <--> AIBridge
    AIBridge <--> Providers
    Harness --> PTYManager
    Harness --> ToolExecutor

    Harness <--> SQLiteDB
    APIGateway <--> SQLiteDB
    Harness --> JSONLFiles
    APIGateway --> JSONLFiles
```

| Component | Responsibility | Location |
|---|---|---|
| **Daemon API Gateway** | Local ingress, session dispatch, token streaming, WebSocket PTY bridge, approval routing | `apps/daemon/src/api/` |
| **Harness Engine** | Reasoning loop, tool parsing, durable checkpoints, generation fencing, verification checks | `apps/daemon/src/harness/` |
| **Web Workbench** | Interactive web UI, chat, file diff review, tool approvals, embedded xterm terminal | `apps/web/` |
| **Terminal CLI** | Interactive terminal UI, command execution, live event stream display | `apps/cli/` |
| **Protocol** | Shared Effect Schemas for requests, responses, and real-time streaming events | `packages/protocol/` |
| **Persistence** | Drizzle ORM schemas, SQLite connection management, JSONL event file handlers | `packages/db/` |

---

## 3. Monorepo Source Layout

```
kantha/
├── turbo.json                  # Turborepo task pipelines
├── package.json                # Bun workspaces root
├── apps/
│   ├── daemon/                 # Bun v1.4+ Daemon
│   │   ├── src/
│   │   │   ├── api/            # Effect HttpApi routes & SSE hub
│   │   │   ├── harness/        # OpenCode-style Effect Harness & AI SDK
│   │   │   ├── pty/            # Cross-platform PTY manager
│   │   │   └── index.ts        # Daemon entry point
│   │   └── package.json
│   ├── web/                    # Vite + React 19 SPA
│   │   ├── src/
│   │   │   ├── routes/         # TanStack Router file-based routes
│   │   │   ├── components/     # Astryx UI composition
│   │   │   ├── terminal/       # @xterm/xterm terminal wrapper
│   │   │   └── main.tsx
│   │   └── package.json
│   └── cli/                    # React Ink CLI
│       ├── src/                # Ink TUI components
│       └── package.json
└── packages/
    ├── protocol/               # Shared typed contracts
    │   ├── src/                # Effect Schema definitions (RPC, events, payloads)
    │   └── package.json
    ├── db/                     # Local persistence
    │   ├── src/                # Drizzle ORM schemas & bun:sqlite client
    │   └── package.json
    └── ui/                     # Legacy UI primitives
        ├── src/                # Legacy UI primitives
        └── package.json
```

---

## 4. Key Architectural Invariants

1. **Local-First Independence:** Zero mandatory cloud database or serverless infrastructure. The platform boots locally and stores all state on the developer's machine.
2. **Zombie-Proof Resource Safety:** All PTY handles, child processes, and file watchers are enclosed in an `Effect.acquireRelease` resource scope. Process interruptions immediately terminate child processes without PID leaks.
3. **Decoupled Clients:** Active agent tasks persist inside the daemon regardless of browser refresh, network drop, or tab close. Clients can seamlessly reconnect and replay event history from JSONL logs.
4. **Pure SPA Frontend:** Zero SSR or hydration complexity. The web workbench compiles to static assets ready for direct daemon hosting or future embedding in Tauri v2.
