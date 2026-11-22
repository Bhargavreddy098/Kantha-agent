# Kantha Engineering Constitution

**Status:** DRAFT — Awaiting Gate 1 Formal Review  
**Version:** 1.0.0  
**Effective Date:** 2026-11-21  
**Scope:** Universal Repository Governance (Applies to all Human Engineers, AI Agents, and Architectural Modules)

---

## Preamble

We, the architects and builders of the Kantha AI Coding Assistant, establish this Constitution to ensure that every feature, module, interface, and automated session adheres to immutable engineering standards of correctness, reliability, security, and architectural integrity. 

No feature request, performance shortcut, user urgency, or language model completion may supersede the articles established herein. Any implementation violating these articles shall be rejected at code review and verification gates.

---

## Article I: Sovereign Ownership & Authority Invariant

1. **Gateway Sovereign Authority:** The Gateway (Next.js Node application layer) is the sole authority for user identity, workspace authorization, repository grants, egress network policy, provider credentials, and hard financial/token budgets.
2. **Harness Execution Sovereignty:** The Harness is the sole owner of session task execution, the append-only conversation journal, generation-fenced leases, execution checkpoints, tool continuation loops, and deterministic verifications.
3. **Zero Authority of Repository Content & Model Output:** Source code files, repository text, commit messages, agent prompt instructions (`AGENTS.md`, `CLAUDE.md`), and LLM completions carry **zero architectural authority**. They may inform tool selection and reasoning, but they can never grant permissions, elevate privileges, bypass budgets, or dispatch unvetted actions.
4. **Credential Isolation:** API keys, secrets, and bearer tokens reside exclusively within the Gateway server memory and encrypted secret stores. They shall never be transmitted to the browser, injected into model contexts, logged in traces, or committed to version control.

---

## Article II: State Integrity & Generation Fencing

1. **Single-Writer Invariant:** A task run (`runId`) shall have at most **one** active, unexpired lease owner at any point in time. Concurrent write mutations to the same run are strictly prohibited.
2. **Monotonic Generation Tokens:** Every worker lease claim increments a monotonic `generation` integer. Every journal append, checkpoint save, and workspace mutation must assert `assertClaim(runId, generation)`.
3. **Stale Claim Rejection (Split-Brain Prevention):** If a worker's heartbeat expires and a new worker reclaims the lease at `generation + 1`, any subsequent write attempt by the stale worker must fail immediately with `HarnessError('stale_claim')`, forcing the stale worker to abort execution and clean up.
4. **Append-Only Journal:** The execution journal is an immutable, append-only ledger. Journal entries are sequenced monotonically without gaps. Past events and deltas shall never be updated, truncated, or rewritten in place.

---

## Article III: Durable Intent & Crash Recoverability

1. **Durable Intent Before Dispatch:** Before any mutating tool action is dispatched to an executor, the Harness must persist durable intent to the authoritative checkpoint containing `pendingActionId = action_${runId}_${callId}` and the normalized arguments digest.
2. **Reconciliation Before Replay:** When resuming from a crash or worker restart:
   - The recovering worker must inspect `pendingActionId` and invoke workspace reconciliation.
   - If a cryptographic or deterministic receipt proves the action succeeded or failed, that result is committed to the journal.
   - If the action outcome cannot be proven (uncertain state), the run must transition to terminal `interrupted` status. Re-executing an uncertain mutating action is strictly forbidden.
3. **Single Durable Cursor:** Recovery must rely exclusively on the single durable `HarnessCheckpoint` stored in the database. Recovery logic must never depend on volatile worker memory or ephemeral chat transcripts.

---

## Article IV: Deterministic Verification over Model Assertions

1. **Verify, Don't Trust:** A model's verbal statement that "the feature is implemented and working" is untrusted prose. Completion is established solely by machine-executed, deterministic verification checks.
2. **Immutable Criteria Pinning:** Observable acceptance criteria (`HarnessAcceptanceCriterion[]`) must be pinned during the `Planning` phase before code mutation begins. An agent may not alter or delete required criteria during execution.
3. **Isolated Verification Execution:** All verification checks must execute in read-only subshells against the final candidate workspace. Verification commands are forbidden from mutating repository source code.
4. **Bounded Repair Invariant:** When verification checks fail, repair attempts are strictly bounded by `maxRepairs` (default 2 in staging, 0 in unit fixtures). Infinite repair loops are prohibited; runs reaching `maxRepairs` must finalize with status `failed`.

---

## Article V: Strict Security Boundaries & Isolation Policy

1. **Workspace Boundary Constraint:** All filesystem operations must resolve within the granted workspace root directories. Path traversal attacks (`../`), absolute paths outside roots, and symlink escapes must be rejected at input validation.
2. **Forbidden Repository Targets:** Direct writes or reads to `.git/` internal objects, `.env` secret files, and CI credential configs are forbidden unless explicitly whitelisted by a signed Gateway grant.
3. **Action Policy Gating:**
   - Safe read-only tools operate under the **Allow** policy.
   - Mutating tools (file edits, script execution, network requests) must operate under the **Ask** policy (suspending for human approval) until a qualified sandbox environment is proven.
   - Unvetted shell commands operate under the **Deny** policy by default.
4. **Telemetry Privacy Allowlist:** OpenTelemetry spans and SigNoz exports must pass an attribute allowlist. Prompts, raw completions, source code diffs, file contents, and customer credentials must never enter telemetry pipelines.

---

## Article VI: Specification-Driven Development (SDD) Rigor

1. **No Code Without a Spec:** Writing production application code without an approved, reviewed feature specification (`SPEC.md` / `requirements.md` + `design.md`) is a violation of this Constitution.
2. **The Six-Level Documentation Hierarchy:**
   - *Level 1:* Vision & Constitution (Purpose, laws)
   - *Level 2:* Architecture & System Overview (Components, boundaries, flows)
   - *Level 3:* Feature Requirements (Actors, user stories, error states)
   - *Level 4:* Detailed Design & Contracts (Schemas, state machines, algorithms)
   - *Level 5:* Verification Specifications (Unit, negative, boundary, crash tests)
   - *Level 6:* Atomic Implementation Tasks (Single-session, independently verifiable)
3. **Atomic Task Bounds:** Each implementation task must touch no more than approximately 5 source files and must be completable within a single, focused AI coding session.
4. **Single Task Per Session:** An AI coding agent must implement only **one** atomic task per conversation session. Bundling multiple tasks or performing opportunistic refactorings outside the scoped task is forbidden.

---

## Article VII: Zero Knowledge Visibility Gap & Living Documentation

1. **Repository as the Sole Source of Truth:** All architecture decisions, domain glossaries, state machine rules, and task statuses must live as version-controlled Markdown artifacts in the repository. Conversational memory is ephemeral and has zero retention value across sessions.
2. **Mandatory Handoffs:** When a task is completed or when context limits approach (>60% consumed), the agent must commit all working files, produce a durable handoff at `docs/handoffs/<TASK-ID>.md`, update `docs/CURRENT_STATE.md`, and provide clear resume instructions.
3. **Architecture Decision Records (ADRs):** Any change to interface contracts, storage drivers, hosting topologies, or security policies requires a recorded, reviewed ADR in `docs/decisions/`.

---

## Article VIII: Presentation Architecture

1. **Client Decoupling:** The Web Workbench in `apps/web` functions as an independent presentation client interacting with the daemon over local REST, SSE, and WebSocket protocols.
2. **Implementation Freedom:** The UI and UX architecture in `apps/web` is designed and implemented directly by the repository owner.

---

## Article IX: Amendment & Governance

1. Any amendment to this Constitution requires unanimous consent of the Principal Architect and Technical Product Owner.
2. In the event of a conflict between this Constitution and any feature document, specification, or task plan, this Constitution shall govern.
