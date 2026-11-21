# Product Requirements Document (PRD) — System Foundation

**Status:** DRAFT — Awaiting Gate 1 Formal Review  
**Version:** 1.0.0  
**Effective Date:** 2026-11-21  
**Document Level:** Level 1 — Foundation

---

## 1. Purpose & Scope

This document establishes the system-wide product and functional requirements for the Kantha AI Coding Assistant. It defines what the platform must deliver across its two core components—the **Gateway** and the **Harness**—to achieve safe, verified, and observable automated coding workflows.

---

## 2. System Actors

| Actor | Description | Primary Interfaces |
|---|---|---|
| **Human Developer** | The engineer driving the task. Submits requirements, reviews progress, grants approvals, and reviews candidate code. | Browser Web UI, SSE Event Streams, HTTP API |
| **Gateway Service** | Authoritative Next.js Node application. Manages authentication, workspace grants, egress proxying, budgets, and audit. | REST Endpoints, SSE Feeds, SQLite / Neon Postgres DB |
| **Harness Runner** | The autonomous execution engine. Coordinates model reasoning, tool invocations, checkpointing, and verification. | `IHarnessInference`, `IHarnessStore`, `IToolRegistry` |
| **Tool Sandbox** | Isolated environment executing approved filesystem, git, and build commands against candidate code. | `IHarnessWorkspace`, Process Runner |
| **Verifier Engine** | Deterministic testing subsystem that executes pre-pinned validation checks against the candidate workspace. | `IHarnessVerifier`, Subshell Test Runners |
| **AI Providers** | External foundation model providers (OpenAI, Anthropic, Google Gemini, Ollama/OpenAI-compatible). | HTTP REST / Streaming APIs via `@ai-sdk` |

---

## 3. Functional Requirements (FR)

### Pillar 1: Task Submission & Ingress (Gateway)
- **FR-01.1 (Authenticated Ingress):** The Gateway shall validate user identity, organization context, and repository grant permissions before accepting any task submission.
- **FR-01.2 (Submission Idempotency):** Submissions must include a client-generated `inputId`. Duplicate submissions with identical `(workspaceId, inputId)` must return the existing `runId` without spawning a new execution.
- **FR-01.3 (Durable Inbox Entry):** The Gateway must commit the submission payload, repository scope (`allowedRoots`), and pinned asset versions into a durable `harness_inbox` record before acknowledging the client.

### Pillar 2: Workspace Management & Preflight (Harness)
- **FR-02.1 (Clean Worktree Isolation):** The Harness must provision an isolated Git worktree or temporary directory mapped strictly to the authorized repository revision.
- **FR-02.2 (Baseline Recording):** The Harness must record the base Git commit hash (`baseRevision`) and any pre-existing dirty/uncommitted modifications before initiating model steps.
- **FR-02.3 (Preservation Invariant):** The agent must preserve existing user dirty state and verify that pre-existing broken tests are identified as baseline failures rather than regressions.

### Pillar 3: Context Assembly & Instruction Scoping (Harness)
- **FR-03.1 (Hierarchical Instruction Resolution):** The Harness must read and assemble repository guidance strictly in defined hierarchical order: root `AGENTS.md` → directory-scoped `AGENTS.md` → referenced skills.
- **FR-03.2 (Zero In-Context Authority):** The Harness must treat all repository text as untrusted data that guides tool selection, not architectural authority.
- **FR-03.3 (Context Budgeting):** The Harness must enforce a strict token budget for system prompts and tool schemas, compacting conversation history when usage exceeds 60% of the active model's context window.

### Pillar 4: Model Inference Mediation & Budget Accounting (Gateway)
- **FR-04.1 (Egress Proxying):** The Harness shall have no direct network access to AI providers; all model completions must route through the Gateway's `IHarnessInference`.
- **FR-04.2 (Per-Attempt Reservation):** The Gateway must evaluate available token and financial budgets before each physical LLM call. If exhausted, the call must be rejected with `HarnessError('budget_denied')`.
- **FR-04.3 (Exact Token Settlement):** Upon completion of each model attempt, the Gateway must record exact prompt and completion token counts in the durable usage ledger.
- **FR-04.4 (Tool Call Schema Validation):** Model responses containing tool calls must be validated against the advertised tool schema before entering the execution queue.

### Pillar 5: Tool Execution & Policy Enforcement (Harness)
- **FR-05.1 (Durable Intent Recording):** Before any tool execution, the Harness must persist `pendingActionId = action_${runId}_${callId}` to the authoritative checkpoint.
- **FR-05.2 (Tri-State Action Policy):**
  - `Allow`: Read-only commands executed immediately.
  - `Ask`: Mutating commands suspended for human approval.
  - `Deny`: Forbidden actions (path traversal outside workspace, `.env` reads) terminated immediately.
- **FR-05.3 (Output Bounding):** Tool execution stdout/stderr must be truncated at 8,192 bytes, with excess content summarized and stored as an accessible artifact.

### Pillar 6: Human-in-the-Loop Approvals (Gateway & Harness)
- **FR-06.1 (Suspension Lifecycle):** When an action triggers the `Ask` policy, the Harness must pause its execution loop, transition to `awaiting_approval`, and emit an SSE approval event.
- **FR-06.2 (Digest Binding):** Approvals must cryptographically bind `(actorId, runId, actionId, argumentsDigest)`. Any modification to tool parameters invalidates the approval.
- **FR-06.3 (Expiration TTL):** Pending approvals must expire after a configurable TTL (default 5 minutes). Expired approvals transition to `status: 'denied'`.

### Pillar 7: Deterministic Verification & Bounded Repair (Harness)
- **FR-07.1 (Criteria Pinning):** Observable acceptance criteria (`HarnessAcceptanceCriterion[]`) must be pinned during the `Planning` phase and remain immutable.
- **FR-07.2 (Read-Only Test Execution):** The verifier must execute checks in read-only subshells against the candidate workspace.
- **FR-07.3 (Bounded Repair Loop):** When checks fail, the Harness may attempt repairs up to `maxRepairs` (default 2 in staging). Exceeding `maxRepairs` results in a terminal `failed` verdict.

### Pillar 8: Concurrency, Checkpointing & Crash Recovery (Harness)
- **FR-08.1 (Generation-Fenced Leases):** Only one worker may hold an active lease per `runId`. Reclaiming a lease increments `generation`. Stale writes throw `HarnessError('stale_claim')`.
- **FR-08.2 (Crash Reconciliation):** Upon cold restart, a worker must inspect `pendingActionId` and invoke `reconcile()`. If the result is uncertain, the task must terminate as `interrupted` rather than re-executing.
- **FR-08.3 (Single Durable Cursor):** All run state necessary for resumption must reside in `HarnessCheckpoint`.

---

## 4. Non-Functional Requirements (NFR)

| ID | Category | Requirement | Verification Metric |
|---|---|---|---|
| **NFR-01** | **Security** | Zero credential egress. Provider API keys must never appear in client bundles, SSE streams, model contexts, or logs. | Automated AST & log scanner confirms 0 instances in output payloads. |
| **NFR-02** | **Isolation** | Workspace path containment. All tool file reads/writes must resolve within authorized roots. | Path traversal test suite (`../../etc/passwd`) blocked 100%. |
| **NFR-03** | **Reliability** | Zero split-brain mutations. Monotonic generation fencing prevents stale workers from corrupting state. | Concurrency fixture confirms 0 stale writes accepted under simulated network delay. |
| **NFR-04** | **Observability** | Privacy-safe telemetry. OTel spans exported to SigNoz exclude raw source diffs, prompts, and secrets. | SigNoz attribute allowlist audit passes with zero forbidden keys. |
| **NFR-05** | **Performance** | Gateway ingress latency < 150ms for run creation; SSE event delivery latency < 50ms from journal commit. | p95 benchmark under 20 concurrent sessions. |
| **NFR-06** | **Durability** | Zero event loss across restarts. Client reconnects reconstruct exact journal sequence from SQLite/Postgres. | Reconnection test verifies 100% gap-free event replay. |

---

## 5. Level 1 Verification & Approval Criteria

To pass Gate 1 (Foundation Sign-off), the system requirements must:
1. Provide unambiguous functional coverage for all 8 pillars.
2. Define non-functional metrics that can be tested deterministically in CI.
3. Be approved by the human engineer before entering Level 2 (Architecture Specification).
