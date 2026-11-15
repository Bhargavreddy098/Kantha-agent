# Instructions for coding agents

Use the `/browse` skill from gstack for all web browsing. Never use `mcp__claude-in-chrome__*` tools.

## Gateway and runtime documentation

Start with [the gateway architecture and OpenCode source map](docs/gateway/README.md), [the contracts](docs/gateway/CONTRACTS.md), and [the agent work plan](docs/gateway/IMPLEMENTATION-PLAN.md). Distinguish current code, fixture evidence and proposed behavior. Preserve unrelated working-tree changes.

## Mandatory frontend reuse policy

Before changing the frontend, read [the UI/UX plan and component reuse rules](docs/frontend/README.md).

Build frontend features by composing existing project components and approved installed libraries. Prefer existing local wrappers, then verified Astryx public components. If no suitable component exists, document the gap and obtain explicit user approval before creating a custom reusable component, adding a library or importing third-party component source. Preserve existing working UI, theme, accessibility and interaction behavior.

## Gateway ownership and contracts

- Keep identity, workspace and repository grants, provider settings, hard-budget admission and durable business audit in the Next.js Node application. Derive authority from authenticated server context. Protect credentials and resolve provider egress from server-managed configuration.
- Preserve the existing chat/models routes, `useChat` and AI SDK UI-message streams through the migration. Qualify any separately authenticated runtime-facing native inference contract and its full tool conversation before use.
- Keep Langfuse and OpenWorker Harness behind their respective interfaces. Qualify the selected inference protocol and per-attempt accounting, and qualify any runtime's persistent hosting and session recovery. The enabled runtime owns the agent loop and its conversation journal. Persist application ownership and submission mappings, use one writer per session, and pin run assets.
- Admit each actual provider attempt once and reconcile its usage. Default telemetry to trusted metadata and usage. Keep the application's durable ledger and audit authoritative.
- Require scoped authorization, durable intent and reconciliation for tool actions. Qualify isolation and recovery before enabling shell, filesystem or MCP execution. A worktree shares host privileges. Recover the same pending action after restart and prevent repeated side effects.
- Verify relevant boundary and end-to-end checks from the work plan. Report unavailable checks and fixture evidence accurately. Keep `src/lib/utils.ts` focused on `cn()`.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
