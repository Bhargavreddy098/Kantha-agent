# Runtime Topology & Daemon Architecture

**Status:** APPROVED FOR PLANNING  
**Version:** 2.0.0  
**Effective Date:** 2026-11-21  
**Document Level:** Level 2 — Technology Specification

---

## 1. Architectural Motivation: The Persistent Local Daemon

Autonomous agent workflows (spanning multi-turn LLM reasoning, code indexing, ripgrep searches, file diff application, interactive terminal commands, and automated test runs) are inherently **stateful and long-running**, often lasting from several seconds to tens of minutes.

Serverless HTTP endpoints and traditional web request lifecycles impose severe limits:
1. Short execution timeouts (15s to 60s) kill long-running agent tasks.
2. Inability to maintain interactive pseudo-terminals (PTYs) or persistent file watchers.
3. High memory and startup overhead in heavy monolithic frameworks.

**The Solution:**  
Kantha standardizes on a **persistent local daemon** built on **Bun (v1.4+)** and **Effect-TS**:
- The daemon runs as an independent OS process, completely decoupled from any browser tab or UI session.
- Client interfaces (the **Vite + React 19 Web Workbench** and **React Ink CLI**) act as lightweight, decoupled observation and control planes connecting over local HTTP, WebSockets, and Server-Sent Events (SSE).
- If the browser is refreshed or closed, the daemon continues executing safely. When reopened, the client reconnects and replays history from the local SQLite database and JSONL stream.

---

## 2. Master System Runtime Topology

```mermaid
flowchart TD
    subgraph Clients ["Client Layer"]
        WebSPA["Web Workbench\n(Vite + React 19 SPA)"]
        TerminalCLI["Terminal UI\n(React Ink CLI)"]
    end

    subgraph Daemon_Process ["Kantha Daemon Process (Bun v1.4+)"]
        subgraph API_Gateway ["Effect HttpApi & Streaming Layer"]
            Router["HttpRouter & Middleware"]
            SSEHub["Effect Stream SSE Hub"]
            WSManager["WebSocket PTY Bridge"]
        end

        subgraph Harness_Core ["OpenCode-Style Effect Harness"]
            Runner["HarnessRunner (Step Loop & Fencing)"]
            AIBridge["Vercel AI SDK (Model Egress)"]
            ContextMgr["Skill & Repo Context Assembler"]
            ApprovalGate["Interactive Approval Gate"]
            Verifier["Deterministic Verifier"]
        end

        subgraph Process_Management ["Process & File Isolation"]
            Scope["Effect Resource Scope (Automatic Lifecycle Cleanup)"]
            PTY["Bun.Terminal / bun-pty Manager"]
            Watcher["File System Watcher & ripgrep"]
            GitWorktree["Git Worktree Adapter"]
        end

        subgraph Local_Store ["Local Storage Engine"]
            SQLite[("bun:sqlite + Drizzle ORM\n(WAL Mode)")]
            JSONL[("JSONL Event Log\n(~/.kantha/sessions/*.jsonl)")]
        end
    end

    WebSPA <-->|HTTP API & SSE Stream| Router
    WebSPA <-->|WebSocket (@xterm/xterm)| WSManager
    TerminalCLI <-->|HTTP / SSE / WS| Router

    Router --> Runner
    Runner --> AIBridge
    Runner --> ContextMgr
    Runner --> ApprovalGate
    Runner --> Verifier

    Runner --> Scope
    Scope --> PTY
    Scope --> Watcher
    Scope --> GitWorktree

    Runner <--> SQLite
    SSEHub <--> SQLite
    Runner --> JSONL
    SSEHub --> JSONL
```

---

## 3. Communication Protocols

| Communication Channel | Protocol | Payload / Serialization | Purpose |
|---|---|---|---|
| **Commands & Ingress** | HTTP (REST) | JSON validated by `Effect Schema` | Session creation, prompt submission, configuration updates, human approval responses. |
| **Event Streaming** | HTTP (SSE) | `text/event-stream` (Schema-encoded) | Real-time token streaming, step indicators, tool calls, and status updates. |
| **Interactive Terminal**| WebSockets | Raw ANSI terminal bytes / chunks | Bi-directional PTY data transmission between `@xterm/xterm` (or Ink) and `bun-pty`. |
| **State Synchronization**| Local IPC / HTTP | JSON (Drizzle Schema) | Querying historical sessions, checkpoints, git diffs, and verification reports. |

---

## 4. Resource Safety via Effect `Scope`

A critical hazard in agent platforms is the accumulation of **zombie child processes** (e.g. abandoned shell commands, hung ripgrep processes, orphaned PTYs) when runs are cancelled or clients disconnect.

Kantha resolves this using Effect's native `Scope` and `acquireRelease`:
```typescript
import { Effect, Scope } from "effect";

// Ensures child processes and PTY handles are guaranteed to terminate upon exit or interrupt
export const makeManagedPty = (options: PtyOptions) =>
  Effect.acquireRelease(
    Effect.sync(() => spawnPty(options)),
    (ptyHandle) =>
      Effect.sync(() => {
        ptyHandle.kill();
      })
  );
```

When an agent run completes, is aborted by user command, or errors out, the enclosing `Scope` closes, guaranteeing that every child process, terminal handle, and file watcher is immediately cleaned up.

---

## 5. Execution Lifecycle Across the Topology

1. **Submission:**
   - The user inputs a task in the **Web Workbench** or **React Ink CLI**.
   - The client posts to `POST /api/sessions/:id/prompt`.
   - The Daemon admits the task, writes an entry to `bun:sqlite`, appends to the session's JSONL log, and kicks off the execution fiber.
2. **Streaming Execution:**
   - The client subscribes to `GET /api/sessions/:id/events` (SSE).
   - The Harness executes reasoning cycles via Vercel AI SDK, streaming tokens and tool call intentions through the `Effect Stream`.
3. **Tool Dispatch & Sandboxing:**
   - When tools run (read, write, ripgrep, bash), they execute against the localized Git worktree.
   - For long-running commands, an interactive PTY session is streamed via WebSocket directly to `@xterm/xterm` in the Web UI.
4. **Approval Gate:**
   - If an action requires approval, execution yields. The client displays the approval card.
   - Upon user response (`POST /api/sessions/:id/approve`), execution resumes seamlessly.
5. **Deterministic Verification:**
   - The Harness runs automated verification checks (typechecks, tests, linters).
   - Final status is committed to SQLite and JSONL, and the final completion event is broadcast.
