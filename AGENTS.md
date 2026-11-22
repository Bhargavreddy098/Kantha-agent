# Instructions for coding agents

Use the `/browse` skill from gstack for all web browsing. Never use `mcp__claude-in-chrome__*` tools.

## Documentation Reading Order

When starting a conversation or picking up work, read documents in this exact order:

1. **Current State:** Read [CURRENT_STATE.md](docs/CURRENT_STATE.md) to identify active work, blockers, and the next ready task.
2. **Implementation Order:** Consult [IMPLEMENTATION-ORDER.md](docs/roadmap/IMPLEMENTATION-ORDER.md) to confirm task readiness and prerequisites.
3. **Task Document:** Open the assigned atomic task file in `docs/features/<domain>/<feature-id>/tasks/<TASK-ID>.md`.
4. **Parent Feature Spec:** Read `docs/features/<domain>/<feature-id>/SPEC.md` for functional requirements, boundaries, and acceptance criteria.
5. **Architecture & Contracts:** Read the relevant domain document in [docs/architecture/](docs/architecture/overview.md) and [architecture.md](architecture.md).
6. **Component Instructions:** Read the component-scoped rules:
   - Daemon: `apps/daemon`
   - Web Workbench: `apps/web`
   - Protocol & Database: `packages/protocol`, `packages/db`

When resuming, then read the linked task handoff and reconcile it with the working tree. The [development guide](docs/README.md) describes how to plan, verify and resume one task.

## Core Engineering Principles

Kantha development must adhere to the principles outlined in our core engineering library:
- **Prioritize Design and Modularity**: Value module depth and clean interfaces (*A Philosophy of Software Design*). Ensure clear application boundaries and dependency direction (*Clean Architecture*).
- **Emphasize Domain Clarity**: Build using ubiquitous language and explicit bounded contexts (*Domain-Driven Design*).
- **Optimize for Maintainability and Reliability**: Prioritize readability (*Clean Code*), build for stability and observability (*Release It!*), and ensure data consistency and durability (*Designing Data-Intensive Applications*).
- **Pragmatic Evolution**: Use behavior-preserving structural changes (*Refactoring*) and characterization tests (*Working Effectively with Legacy Code*) to improve code safely.
- **Engineering Excellence**: Always consider trade-offs and favor fast feedback cycles (*The Pragmatic Programmer*).
- **Book-Based Guidance**: Use the [Agent Rules Books skill](.agents/skills/agent-rules-books/SKILL.md) when a specific engineering book rule set applies.

## Operational Rules for Coding Agents

### 1. One Task Per Session
- Implement **only one atomic task** per conversation turn or session.
- Never bundle multiple feature tasks or perform opportunistic refactoring outside the scoped task.
- Respect all "Invariants" and "Out of scope" declarations in the task file.

### 2. Context Window Survival & Handoffs
- Use the [handoff template](docs/handoffs/TEMPLATE.md) at a useful checkpoint so another agent can recover even after an unexpected context reset.
- Always monitor remaining context. If context window is running low (>60% consumed or when complex work approaches conversational limits):
  1. Stop before starting another modification cycle.
  2. Commit or document uncommitted working changes.
  3. Write a durable handoff at `docs/handoffs/<TASK-ID>.md` recording what was completed, files changed, verification results, known issues, and the exact next step.
  4. Update [CURRENT_STATE.md](docs/CURRENT_STATE.md).
  5. Provide clear resume instructions for the next agent.

### 3. Verification Before Completion
- An agent's self-assessment is informational. A task is only `DONE` when:
  - All commands in the task's "Verification" section have been executed.
  - Actual command outputs and evidence are verified and captured.
  - All acceptance criteria in the task file are satisfied.
  - Handoff document is written and committed.

### 4. Architectural Ownership & Invariants
- **Daemon owns authority & execution:** Credentials, workspace grants, repository access, budget accounting, conversation journal, step loop, checkpointing, and verification live in the Bun Daemon process (`apps/daemon`).
- **Clients are presentation and control planes:** The Web Workbench (`apps/web`) and Terminal CLI (`apps/cli`) observe and submit actions over local HTTP, SSE, and WebSockets.
- **Durable intent before dispatch:** Every mutating tool action must persist intent (`action_${runId}_${callId}`) before execution to enable safe interruption recovery.
- **Resource safety via Scope:** All interactive PTYs, child processes, and watchers are managed under Effect `Scope` to guarantee zero zombie processes.
