# Instructions for coding agents

Use the `/browse` skill from gstack for all web browsing. Never use `mcp__claude-in-chrome__*` tools.

## Core Engineering Principles

Kantha development must adhere to the principles outlined in our core engineering library. Agents are expected to:
- **Prioritize Design and Modularity**: Value module depth and clean interfaces (A Philosophy of Software Design). Ensure clear application boundaries and dependency direction (Clean Architecture).
- **Emphasize Domain Clarity**: Build using ubiquitous language and explicit bounded contexts (Domain-Driven Design).
- **Optimize for Maintainability and Reliability**: Prioritize readability (Clean Code), build for stability and observability (Release It!), and ensure data consistency and durability (Designing Data-Intensive Applications).
- **Pragmatic Evolution**: Use behavior-preserving structural changes (Refactoring) and characterization tests (Working Effectively with Legacy Code) to improve code safely.
- **Engineering Excellence**: Always consider trade-offs and favor fast feedback cycles (The Pragmatic Programmer).

## Architecture and feature documentation

Start with [Kantha architecture](architecture.md) for ownership and release order. Read the documents for the area you are changing.

- **Gateway:** [Architecture and OpenCode source map](docs/gateway/README.md), [contracts](docs/gateway/CONTRACTS.md), [implementation plan](docs/gateway/IMPLEMENTATION-PLAN.md) and [verification and deployment](docs/gateway/RUNNING.md).
- **Harness:** Start with the [feature map and end-to-end build path](docs/harness/features/README.md), then read the feature spec for the area you are changing. Use the [shared harness contract](docs/harness/HARNESS.md), [implementation plan and acceptance gates](docs/harness/IMPLEMENTATION-PLAN.md) and [source documents and Markdown authoring guide](docs/harness/SOURCES.md).
- **Orchestrator, plugins and automations:** [Release prerequisites and ownership](architecture.md#release-sequence). Complete harness qualification before starting the orchestrator.

Distinguish current code, fixture evidence and proposed behavior. Preserve unrelated working-tree changes.

## Book-based engineering guidance

Use the [Agent Rules Books skill](.agents/skills/agent-rules-books/SKILL.md) when a book is named or its guidance materially fits the task. Select one relevant mini rule set. The gateway contracts and project instructions govern Kantha-specific behavior.

## Mandatory frontend reuse policy

Before changing the frontend, read [the UI/UX plan and component reuse rules](docs/frontend/README.md).

Import components through public subpaths of the installed `@astryxdesign/core` package in feature screens. Use `src/ui` as a reference for examples and source details. Verify the supported API against the installed package. If Astryx lacks a capability, document the gap and ask for explicit user approval before adding a local component or introducing a dependency. Follow the theme, accessibility and verification guidance in the frontend plan.

## Gateway ownership and contracts

- Keep identity, workspace and repository grants, provider settings, hard-budget admission and durable business audit in the Next.js Node application. Derive authority from authenticated server context. Protect credentials and resolve provider egress from server-managed configuration.
- Preserve the existing chat/models routes, `useChat` and AI SDK UI-message streams through the migration. Qualify any separately authenticated runtime-facing native inference contract and its full tool conversation before use.
- Export privacy-safe OpenTelemetry signals through the Collector to SigNoz as described in the [operations contract](docs/harness/features/OPERATIONS.md). Keep OpenWorker Harness behind the runtime interface. Qualify the selected inference protocol and per-attempt accounting, and qualify any runtime's persistent hosting and session recovery. The enabled runtime owns the agent loop and its conversation journal. Persist application ownership and submission mappings, use one writer per session, and pin run assets.
- Admit each actual provider attempt once and reconcile its usage. Default telemetry to trusted metadata and usage. Keep the application's durable ledger and audit authoritative.
- Require scoped authorization, durable intent and reconciliation for tool actions. Qualify isolation and recovery before enabling shell, filesystem or MCP execution. A worktree shares host privileges. Recover the same pending action after restart and prevent repeated side effects.
- Verify relevant boundary and end-to-end checks from the work plan. Report unavailable checks and fixture evidence accurately. Keep `src/lib/utils.ts` focused on `cn()`.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
