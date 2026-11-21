# Current Development State

**Updated 2026-11-21** · [Development guide](README.md) · [Architecture Overview](architecture/overview.md) · [Technology Stack](technology/STACK.md)

Kantha is an autonomous, high-performance, local-first AI coding assistant and daemon workbench modeled on modern assistants (OpenCode, Cursor, Claude Code). The legacy manual access token login screens and cloud database dependencies have been eliminated in favor of **Automatic Local Session Authentication** ([ADR-007](decisions/ADR-007-automatic-local-session-authentication.md)), **strict Host/Origin fencing**, and **automatic workspace discovery**.

| Question | Current Answer |
| :--- | :--- |
| **What is the architecture baseline?** | [Technology Stack Specification](technology/STACK.md), [Runtime Topology](technology/RUNTIME-TOPOLOGY.md), [Database Strategy](technology/DATABASE-STRATEGY.md), and [Monorepo Code Structure](code-structure.md). |
| **What is the runtime & monorepo stack?** | **Turborepo + Bun** monorepo, **Bun v1.4+** daemon runtime, **Effect-TS (`effect` + `HttpApi` + `Schema`)**, **Vercel AI SDK + Custom Effect Harness (OpenCode V2)**, **bun:sqlite + Drizzle ORM + JSONL** persistence, **Vite + React 19 + TanStack Router/Query + Tailwind v4 + Radix UI** SPA, and **React Ink** CLI. |
| **How is onboarding & authentication handled?** | **Automatic Local Session Authentication ([ADR-007](decisions/ADR-007-automatic-local-session-authentication.md))**: Fully implemented and verified. Zero manual login prompts or token entry. The daemon generates an in-memory session secret and an ephemeral single-use **Pairing Ticket** (`#ticket=...`), which the browser SPA exchanges for an `HttpOnly`, `SameSite=Strict`, port-scoped cookie (`kantha_session_<port>`). All REST, SSE, and WebSocket PTY endpoints enforce fail-closed Host validation (defeating DNS rebinding), strict Origin checks, and pre-upgrade WebSocket authentication. Verified by 14 automated security tests. |
| **What is the state of the Desktop Shell?** | Deferred to a later phase (Tauri v2 will wrap the compiled Vite SPA once daemon and web core stabilize). |
| **Which approvals are open?** | SDD Gate 2 Technology Stack and Architecture Specifications approved for planning. |
