# Code Structure & Monorepo Layout

This document describes the canonical monorepo structure for Kantha, organized as a **Turborepo + Bun Workspaces** project.

| Location | Responsibility | Stack |
|---|---|---|
| `apps/daemon` | Persistent local background service running the API gateway and coding harness. | Bun v1.4+, Effect-TS (`effect`, `HttpApi`), Vercel AI SDK, `bun-pty`, ripgrep |
| `apps/web` | Web Workbench user interface: session dashboard, chat, diff viewer, interactive terminal. | Vite 6+, React 19, TanStack Router, TanStack Query, Astryx, `@xterm/xterm` |
| `apps/cli` | Terminal user interface for developers working directly in the console. | React Ink, Bun |
| `packages/protocol` | Authoritative wire contracts, schemas, and event definitions shared across apps. | Effect Schema |
| `packages/db` | Local persistence schemas, SQLite client initialization, and migrations. | `bun:sqlite`, Drizzle ORM |
| `packages/ui` | Legacy UI primitives. | React 19, Tailwind CSS v4, Radix UI |

---

## Architectural Boundaries

1. **Daemon owns execution and persistence:** The daemon alone manages the SQLite database, JSONL event files, child processes, Git worktrees, and provider API keys.
2. **Clients are stateless observers & controllers:** `apps/web` and `apps/cli` interact strictly with the daemon via HTTP, SSE, and WebSockets.
3. **No circular dependencies:** Apps may depend on packages (`packages/*`), but packages must never import from apps.
