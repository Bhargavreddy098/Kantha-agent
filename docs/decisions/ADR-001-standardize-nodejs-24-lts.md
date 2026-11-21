# ADR-001: Standardize on Bun v1.4+ Runtime and Turborepo Monorepo

**Status:** ACCEPTED FOR PLANNING  
**Date:** 2026-11-21  
**Deciders:** Principal Software Architect, Engineering Lead  
**Technical Area:** Runtime Environment & Repository Topology

---

## Context
Earlier planning considered standardizing on Node.js 24 LTS and a monolithic Next.js repository. However, evaluating the performance and operational requirements for an autonomous coding agent (instant process startup, native SQLite in WAL mode, sub-second workspace package management, typed protocol sharing, and cross-platform terminal management) demonstrated significant advantages in adopting **Bun (v1.4+)** and **Turborepo**:
1. **Bun Performance:** Sub-millisecond process boot, 4x faster module resolution, native WebSockets, and high-performance embedded SQLite (`bun:sqlite`).
2. **Turborepo Monorepo Architecture:** Cleanly isolates the daemon backend (`apps/daemon`), the web frontend (`apps/web`), and the terminal CLI (`apps/cli`), while sharing typed schemas (`packages/protocol`), database models (`packages/db`), and UI tokens (`packages/ui`).

---

## Decision
1. **Standardize on Bun v1.4+** as the universal JavaScript/TypeScript runtime and package manager for local development, CI/CD, and daemon execution.
2. **Adopt Turborepo (`turbo.json`) with Bun workspaces** to orchestrate build, test, and typecheck dependency graphs across apps and shared packages.
3. Configure monorepo structure:
   - `apps/daemon` (Bun v1.4+ Daemon, Effect HttpApi, Custom Effect Harness)
   - `apps/web` (Vite + React 19 SPA)
   - `apps/cli` (React Ink TUI)
   - `packages/protocol` (Shared Effect Schema wire contracts)
   - `packages/db` (Drizzle ORM + `bun:sqlite`)
   - `packages/ui` (Radix primitives & Tailwind v4 styling)

---

## Consequences
### Positive
- Sub-second installations and builds across all workspaces.
- Zero-cost schema and type sharing between daemon, web UI, and CLI.
- Native `bun:sqlite` eliminates native C++ addon compilation hurdles (`node-gyp`).

### Negative
- Developers must have Bun (v1.4+) installed on their development machines.
