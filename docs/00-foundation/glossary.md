# Domain Glossary & Ubiquitous Language

**Status:** DRAFT — Awaiting Gate 1 Formal Review  
**Version:** 1.0.0  
**Effective Date:** 2026-11-21  
**Document Level:** Level 1 — Foundation

---

## 1. Overview

This glossary establishes the canonical Ubiquitous Language (per Eric Evans' *Domain-Driven Design*) for the Kantha platform. All specifications, architectural models, interface names, database schemas, and AI agent prompts must adhere to these terms. Synonyms or colloquial variants are strictly prohibited.

---

## 2. Core Architectural Entities

| Term | Definition | Authoritative Owner |
|---|---|---|
| **Gateway / Daemon** | The authoritative Bun v1.4+ daemon process that manages local API ingress, workspace grants, egress proxying, model provider credentials, budget enforcement, and durable audit via Effect HttpApi. | Daemon Domain |
| **Harness** | The isolated execution engine (Custom Effect Harness) that coordinates single-session coding tasks, drives the model step continuation loop, manages leases, appends to the journal, and executes verification checks. | Harness Domain |
| **Tool Sandbox / Executor** | The isolated execution environment responsible for safely executing validated filesystem, search, build, and test operations against the repository (via worktrees, Kiri MicroVMs, ripgrep, and PTYs). | Execution Domain |
| **Client** | The presentation layer (Vite + React 19 Web Workbench SPA and React Ink CLI) that submits tasks, renders streaming progress, displays approvals, and connects via SSE/WebSocket. | Client Domain |
| **Storage Engine** | The local-first persistence engine (`bun:sqlite` with Drizzle ORM in WAL mode + append-only JSONL event logs) providing zero-cloud, instant ACID storage. | Storage Domain |

---

## 3. Session & Run Lifecycle Terms

| Term | Definition |
|---|---|
| **Session (`sessionId`)** | An overarching conversational and audit container tracking user engagement and cumulative resource usage across multiple tasks. |
| **Run (`runId`)** | A single autonomous task execution lifecycle initiated by a user submission. Traverses: `Admitted` → `Preparing` → `Planning` → `Executing` ↔ `AwaitingApproval` → `Verifying` → `Finalizing`. |
| **Input ID (`inputId`)** | A client-generated UUID representing a distinct task request. Used by the Gateway for submission deduplication and idempotent replay. |
| **Public Run ID** | The universally unique identifier issued by the Gateway upon task admission. Returned immediately to the client to track asynchronous progress. |
| **Claim (`HarnessClaim`)** | A time-bounded, generation-fenced lease acquired by a worker process granting exclusive write authority over a specific `runId`. |
| **Generation (`generation`)** | A strictly monotonic integer incremented every time a lease is claimed or reclaimed. Prevents split-brain mutations from stale workers. |
| **Stale Claim** | An invalid write attempt made by a worker whose lease has expired or been reclaimed by another worker at a higher generation. Rejection throws `HarnessError('stale_claim')`. |

---

## 4. Execution, Journaling & Checkpoint Terms

| Term | Definition |
|---|---|
| **Conversation Journal** | The append-only, immutable, gap-free ledger (`harness_journal`) recording every lifecycle event, model step, assistant delta, tool proposal, tool result, and verification verdict. |
| **Journal Sequence (`sequence`)** | A strictly increasing integer assigned to each journal entry within a transaction, ensuring deterministic SSE replay and ordered client reconstruction. |
| **Checkpoint (`HarnessCheckpoint`)** | The single authoritative, durable cursor persisted before any external side effect. Contains the exact execution phase, step, pending actions, completed tool results, and repair counters needed for cold-start crash recovery. |
| **Action Intent** | A persistent record committed to the checkpoint prior to dispatching any tool. Formatted as `action_${runId}_${callId}` along with the cryptographic argument digest. |
| **Pending Action (`pendingActionId`)** | An active action intent currently executing in a sandbox or suspended for human approval. If a crash occurs, this ID must be reconciled before resumed execution. |
| **Reconciliation (`reconcile()`)** | The deterministic process whereby a recovering worker inspects an in-flight `pendingActionId` against filesystem receipts to determine if the side effect completed, failed, or is uncertain. |
| **Uncertain Outcome** | A state where an in-flight tool action cannot be proven to have succeeded or failed following an abnormal termination. Forces the run to terminate with `interrupted` to prevent duplicate destructive mutations. |

---

## 5. Tooling, Security & Policy Terms

| Term | Definition |
|---|---|
| **Action Policy** | The tri-state security classification applied to every proposed tool call: `Allow` (immediate execution), `Ask` (suspend for human approval), or `Deny` (immediate termination). |
| **Approval Digest** | A cryptographic hash `SHA256(actionId + runId + normalizedArgs)` bound to a pending action. Any tampering with tool arguments invalidates the approval. |
| **Approval TTL** | The time-to-live window (default 5 minutes) during which a human may approve a suspended action before it automatically expires and denies. |
| **Tool Output Bounding** | The hard limit (8,192 bytes) enforced on tool stdout/stderr to prevent LLM context flooding. Excess output is summarized and written to artifact storage. |
| **Attribute Allowlist** | The strict filtering schema enforced on OpenTelemetry spans and SigNoz exports to ensure source diffs, prompts, and secrets never leak to observability sinks. |

---

## 6. Verification & Quality Terms

| Term | Definition |
|---|---|
| **Acceptance Criterion (`HarnessAcceptanceCriterion`)** | An immutable, testable condition pinned during the `Planning` phase specifying an observable behavior and machine-executable check command (`check`). |
| **Candidate Workspace** | The isolated working tree containing all file modifications made by the agent during the `Executing` phase. Evaluated during `Verifying`. |
| **Deterministic Verifier (`IHarnessVerifier`)** | The subsystem that executes pinned checks in a read-only subshell against the candidate workspace, producing machine-verified pass/fail verdicts. |
| **Bounded Repair Loop** | The constrained retry cycle triggered when verification checks fail. Limited by `maxRepairs` (default 2 in staging); exceeding the limit produces a terminal `failed` verdict. |
| **Capability Gap** | The divergence between a model's theoretical reasoning capability and its practical engineering execution in real codebases. |
| **Verification Gap** | The divergence between an agent's self-assessed completion claim ("I have fixed the issue") and actual machine-verified correctness. |
| **Knowledge Visibility Gap** | The divergence between knowledge discussed ephemeral in chat sessions and the authoritative information preserved in repository documentation. |
| **Overreach** | A catastrophic agent failure mode where an agent modifies unrelated code, refactors surrounding functions, or installs unapproved dependencies outside its scoped task. |
| **Under-finish** | An agent failure mode where an agent stops prematurely, writes superficial stubs, or claims completion without running verification tests. |
