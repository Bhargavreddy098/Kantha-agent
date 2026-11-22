# Kantha Agent

An autonomous AI coding agent and developer workbench built on a high-concurrency, local-first monorepo architecture.

## Canonical Tech Stack

- **Monorepo**: Turborepo + Bun Workspaces
- **Daemon Runtime**: Bun (v1.4+)
- **Daemon API & Streaming**: Effect (`effect` + `HttpApi` + `Schema`)
- **Coding Harness**: Vercel AI SDK + Custom Effect Harness (OpenCode V2)
- **PTY & File Watching**: Bun.Terminal (POSIX) / `bun-pty` (Windows) + `ripgrep`
- **Local Persistence**: `bun:sqlite` + Drizzle ORM (WAL mode) + JSONL event log
- **Web Workbench UI**: Vite + React 19 + TanStack Router + TanStack Query + Astryx + `@xterm/xterm`
- **Terminal CLI**: React Ink

---

The Web Workbench (`apps/web`) is a modern React 19 Single Page Application connecting to the local Bun daemon.

## Repository Structure

```
├── apps/
│   ├── daemon/        # Bun v1.4+ Runtime, Effect HttpApi, Custom Effect Harness
│   ├── web/           # Vite + React 19 + TanStack Router/Query + Astryx SPA
│   └── cli/           # React Ink Terminal UI
└── packages/
    ├── protocol/      # Effect Schema wire types and streaming events
    ├── db/            # Drizzle ORM schemas & bun:sqlite client (WAL mode)
    └── ui/            # Legacy UI primitives
```

---

## Getting Started

### Prerequisites
- [Bun](https://bun.sh/) (v1.4.0+) or [Node.js](https://nodejs.org/) (v24 LTS)
- [pnpm](https://pnpm.io/) (v10+)

### Installation
```bash
pnpm install
```

### Development
```bash
# Start the Bun daemon (API & Effect Harness) on http://localhost:4000
pnpm dev:daemon

# Start the Vite React 19 Web Workbench on http://localhost:3000
pnpm dev:web

# Start the React Ink Terminal CLI
pnpm dev:cli

# Run all workspaces concurrently via Turborepo
pnpm dev
```

### Typecheck & Build
```bash
# Typecheck all packages & apps
pnpm typecheck

# Build all packages & apps
pnpm build
```
