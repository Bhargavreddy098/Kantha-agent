# ADR-002: Adopt Persistent Bun Daemon with Effect HttpApi & Custom Effect Harness

**Status:** ACCEPTED FOR PLANNING  
**Date:** 2026-11-21  
**Deciders:** Principal Software Architect, Systems Designer  
**Technical Area:** Runtime Topology, API Gateway & Harness Engine

---

## Context
In Kantha, an autonomous coding task can run for 1 to 20 minutes across multiple model reasoning steps, large file patchings, and automated build/test verifications. 

Binding execution to a Next.js web application or serverless request lifecycle introduces fatal hazards:
1. Serverless HTTP route timeouts (15s to 60s) prematurely kill agent tasks.
2. Closing or refreshing a browser tab drops in-flight tasks and leaves orphaned terminal processes.
3. Managing zombie child processes and interactive pseudo-terminals is fragile in standard HTTP frameworks.

---

## Decision
1. **Persistent Local Daemon:** Run the core agent platform as an independent OS background daemon (`apps/daemon`) on Bun v1.4+.
2. **Effect HttpApi & Streaming:** 
   - Expose type-safe HTTP, WebSocket, and Server-Sent Events (SSE) endpoints using **Effect-TS (`effect` + `HttpApi` + `@effect/platform-bun`)**.
   - Stream model reasoning tokens, step updates, and tool execution logs via `Effect Stream`.
3. **OpenCode V2 Style Custom Effect Harness:**
   - Execute the agent reasoning and tool loop inside a dedicated Effect runtime.
   - Leverage `Effect.acquireRelease` and `Scope` to guarantee that all child processes, PTYs, and file watchers are automatically killed upon task completion, cancellation, or error.
4. **Decoupled Clients:**
   - The Web Workbench (`apps/web`) and Terminal CLI (`apps/cli`) are purely presentation and control clients that connect to the daemon over local HTTP/SSE/WS.

---

## Consequences
### Positive
- Browser disconnects or reloads never terminate active agent runs.
- Absolute prevention of zombie child processes and leaked terminal handles.
- 100% type safety and structured error channels across the daemon boundaries.

### Negative
- Requires developers to understand Effect-TS idioms (`Effect<Success, Error, Requirements>`, `Scope`, `Schema`).
