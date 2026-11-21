# Custom Effect Harness Architecture

**Status:** Canonical Target Architecture (OpenCode V2 Style)  
**Owner:** Execution & Agent Layer (`apps/daemon/src/harness/`)

## 1. Overview and Responsibility

The Harness is the autonomous execution engine of Kantha, implemented as a **Custom Effect Harness** hosted within the persistent Bun daemon process. It coordinates reasoning cycles, tool invocations, code modifications, and deterministic verification.

Key responsibilities:
- Managing iterative model reasoning steps and tool execution loops.
- Enforcing resource isolation and cleanup via **Effect `Scope`** (guaranteeing zero zombie processes on exit or interrupt).
- Managing multi-provider model egress through the **Vercel AI SDK**.
- Persisting state checkpoints to `bun:sqlite` and streaming chronological events to append-only JSONL files.
- Running deterministic verification checks against modified worktrees prior to declaring task completion.
- Recovering interrupted runs from durable checkpoints without lost progress or duplicate mutations.

## 2. Core Subsystems

| Subsystem | Location | Key Responsibilities |
|---|---|---|
| **Effect Runner Loop** | `apps/daemon/src/harness/runner.ts` | Fiber-based execution loop (step limits, elapsed time guards, token bounding). |
| **Model Adapter** | `apps/daemon/src/harness/ai-sdk.ts` | Vercel AI SDK integration (`streamText`, `generateObject`, tool schema definitions). |
| **Resource Scope** | `apps/daemon/src/harness/scope.ts` | `Effect.acquireRelease` wrappers for child processes, PTYs, and file watchers. |
| **Context Assembler** | `apps/daemon/src/harness/context.ts` | Assembles AGENTS.md instructions, skill files, and ripgrep code summaries into LLM prompts. |
| **Tool Registry** | `apps/daemon/src/harness/tools.ts` | Typed tool definitions (read_file, write_file, edit_file, ripgrep, bash/terminal). |
| **Deterministic Verifier** | `apps/daemon/src/harness/verifier.ts`| Pinned acceptance checks (typecheck, tests, linters) executed in isolated subshells. |
| **Journal & Checkpointing** | `apps/daemon/src/harness/journal.ts` | Checkpoints written to `bun:sqlite` and streamed to `~/.kantha/sessions/{id}/events.jsonl`. |

## 3. The 5 Subsystems of Kantha Harness

1. **Instructions:** Root `AGENTS.md`, scoped directory `AGENTS.md`, and versioned skill bundles (`.agents/skills/`). Model context is bounded and deterministic.
2. **Tools:** Scoped read, search, and patch operations. Every mutating operation persists intent before dispatch and supports idempotent replay.
3. **Environment:** Workspace preflight, git worktree isolation, dirty state tracking, and isolated check execution environments.
4. **State:** High-speed `bun:sqlite` relational state, generation fencing, and append-only JSONL event logs.
5. **Feedback:** Deterministic verifier checks evaluated through official project build/test commands and interactive human approval boundaries.
