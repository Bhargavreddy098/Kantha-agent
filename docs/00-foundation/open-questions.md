# Open Architectural & Product Questions (Foundation Level)

**Status:** DRAFT — Awaiting Gate 1 Formal Review  
**Version:** 1.0.0  
**Effective Date:** 2026-11-21  
**Document Level:** Level 1 — Foundation

---

## 1. Overview

Specification-Driven Development mandates that no architectural ambiguity or hidden assumption be silently resolved during implementation. This document tracks all open technical decisions and architectural questions for Kantha. Each item provides context, viable options, trade-offs, and an architect's recommendation. 

These questions must be reviewed and formally resolved before corresponding Level 4 Detailed Design contracts are finalized.

---

## 2. Decision Briefs

### D-01: Runtime Hosting Topology for Daemon and Harness Worker
- **Context:** The Harness runner executes long-running agent loops (1 to 20 minutes) that include inference steps, tool executions, and test runs. 
- **Resolution (ADR-001 & ADR-002):** **Adopt Persistent Bun v1.4+ Daemon with Effect HttpApi and Custom Effect Harness.** Decouples execution completely from web request timeouts and browser disconnects. Clients (Vite SPA and React Ink CLI) connect over local HTTP, SSE, and WebSockets.

---

### D-02: Local Persistence & Event Stream Strategy
- **Context:** Deciding between cloud database infrastructure (Neon Postgres) vs. local-first storage.
- **Resolution (ADR-003):** **Adopt Local-First `bun:sqlite` with Drizzle ORM in WAL mode + Append-Only JSONL Event Log.** Delivers sub-millisecond ACID transactions with zero cloud database setup for users, while JSONL files stream unbounded conversation events and tokens without SQLite bloat.

---

### D-03: Human Approval Ergonomics & Granularity
- **Context:** If every mutating tool invocation triggers an `Ask` policy suspension, the human developer experiences severe approval fatigue, leading to rubber-stamping or abandoning automation.
- **Options:**
  1. *Option A (Strict Per-Action Approval):* Every single file write, patch, or command requires an individual human click. Safe, but agonizingly slow for 15-step tasks.
  2. *Option B (Session-Scoped Pre-Approvals):* The user can select "Approve all file writes in `src/` for this run", retaining mandatory approvals only for shell execution, git commits, or root-level config changes.
  3. *Option C (Digest-Based Auto-Approve on Replay):* If a task is resumed or repaired, previously approved actions with identical argument digests are auto-approved.
- **Trade-offs:** Option B balances safety with real-world developer ergonomics.
- **Recommendation:** **Adopt Option A as the baseline security default, with an opt-in Option B ("Pre-approve workspace writes") toggle enabled per run submission.**

---

### D-04: Context Compaction Strategy & Watermarks
- **Context:** Extended coding runs with multiple tool calls and test outputs quickly consume context windows (e.g., 128k–200k tokens), driving up costs and degrading reasoning fidelity.
- **Options:**
  1. *Option A (Sliding Window Pruning):* Drop earliest tool results and assistant text deltas once total tokens exceed 70% of context limit.
  2. *Option B (Summarization & Pinning):* Periodically invoke a cheap model (e.g., Gemini Flash / Claude Haiku) to condense past steps into an immutable progress summary, preserving system instructions and acceptance criteria.
  3. *Option C (Tool Output Eviction):* Keep all assistant reasoning steps, but replace historical tool outputs with lightweight 1-line pointers (`[Tool Output Evicted — Artifact #492]`).
- **Trade-offs:** Option C preserves the chain of thought while shedding 85% of token bulk.
- **Recommendation:** **Adopt Option C (Tool Output Eviction with artifact references) combined with Option B (Progress Summarization) when exceeding 60% context utilization.**

---

### D-05: Workspace & Filesystem Isolation Mechanism
- **Context:** An autonomous agent generating and executing code can inadvertently damage the developer's working tree or host operating system if path containment fails.
- **Options:**
  1. *Option A (Local Git Worktree with Path Sanitization):* Uses `git worktree add` in a sibling directory. Path validation checks prevent directory traversal. Fast, zero-dependency, but runs with the user's host OS permissions.
  2. *Option B (Containerized Sandbox / Docker):* Mounts the workspace inside a Docker container with non-root permissions and restricted network access.
  3. *Option C (Wasm / MicroVM Sandbox):* Runs tools inside WebAssembly or Firecracker microVMs. Maximum security, but complex tool compilation.
- **Trade-offs:** Option A is fast for local CLI usage; Option B is mandatory for shared server deployments.
- **Recommendation:** **Use Option A (Strict Git Worktree + Path Sanitizer) for Milestone H1–H3. Require Option B (Docker Sandbox) for Milestone H4 and staging.**

---

### D-06: Evidence Artifact Storage Sink
- **Context:** Verification check runs generate raw test outputs, unified diffs, lint logs, and screenshots that exceed the 8,192-byte inline tool limit.
- **Options:**
  1. *Option A (Local Filesystem Directory):* Store artifacts under `.gateway-data/artifacts/<runId>/`. Simple, but ephemeral across container redeployments.
  2. *Option B (S3-Compatible Object Store):* Store artifacts in Cloudflare R2 / AWS S3 / MinIO with signed expiration URLs. Durable, accessible across distributed nodes.
  3. *Option C (Database BLOBs):* Store artifacts directly in SQLite/PostgreSQL as byte columns. Simplifies backups, but causes database bloat.
- **Trade-offs:** Database bloat (Option C) harms query performance. S3 (Option B) requires cloud credentials.
- **Recommendation:** **Implement an `IArtifactStore` abstraction. Use local filesystem (`.gateway-data/artifacts`) for dev/single-process, and S3-compatible storage (R2/S3) for distributed staging.**

---

### D-07: Live Model Qualification Matrix
- **Context:** Different foundation models exhibit varying strengths: Claude 3.5 Sonnet excels at precise unified diffs and instruction following; GPT-4o has strong API speed; Gemini 1.5 Pro offers massive context windows.
- **Options:**
  1. *Option A (Single Pinned Provider):* Design exclusively for Claude 3.5 Sonnet.
  2. *Option B (Dynamic Provider via AI SDK):* Standardize on AI SDK Core `streamText` normalization, supporting any compliant provider with provider-specific prompt adapters.
- **Trade-offs:** Option B prevents vendor lock-in and allows developers to bring their own API keys.
- **Recommendation:** **Adopt Option B. Qualify Claude 3.5 Sonnet as the primary reference baseline, with secondary qualification for GPT-4o and Gemini 1.5 Pro.**

---

### D-08: Evaluation Benchmark Suite Selection
- **Context:** How do we prove that Kantha is ready for production release without relying on subjective vibe checks?
- **Options:**
  1. *Option A (Synthetic In-Repo Fixtures Only):* 3 scripted tasks in `test-harness-fixtures.mjs`. Fast in CI, but does not test real-world developer repositories.
  2. *Option B (Pinned Real Repositories):* Select two real open-source repositories (e.g., an Express/Node app and a Next.js/React app) with 10 real bug-fix tasks.
  3. *Option C (Full SWE-bench Lite):* Run 300 benchmark instances. Comprehensive, but extremely expensive in API credits ($500+ per run) and slow (10+ hours).
- **Trade-offs:** Option B provides production-grade confidence at reasonable cost and runtime.
- **Recommendation:** **Adopt Option B for Milestone H5 Release Qualification: 2 pinned repositories, 10 reproducible bug/feature tasks, measured against deterministic test suites.**

---

### G-01: SSE Reconnection Protocol Semantics
- **Question:** How does the browser UI reconstruct active run state when reconnecting after a network drop?
- **Recommendation:** The client sends `Last-Event-ID: <sequence>`. The Gateway queries `readEvents(sessionId, sequence)` and streams missed deltas. If the sequence is expired/compacted, the Gateway sends a single authoritative `snapshot` event from `HarnessCheckpoint`.

---

### G-02: Multi-File Patching Format & Tool Signature
- **Question:** How should the agent propose changes across multiple files?
- **Recommendation:** Standardize on atomic unified diff blocks per file with line numbers and context anchors (`git_apply_patch`), rejecting unstructured search-and-replace strings that corrupt files on partial matches.

---

### G-03: Subprocess Process Kill & Abort Propagation
- **Question:** When a user clicks "Stop" or an execution times out, how are running build/test processes killed?
- **Recommendation:** Wrap child process execution in dedicated process groups (`detached: true` on POSIX / `CREATE_NEW_PROCESS_GROUP` on Windows) so that abort signals terminate the entire process tree, preventing orphaned background compiler processes.
