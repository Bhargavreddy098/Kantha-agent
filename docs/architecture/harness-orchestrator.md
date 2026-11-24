# Kantha Harness Orchestrator Architecture

**Modules:**
- `apps/daemon/src/harness/orchestrator.ts` — Pure orchestration planning, batching, context compaction, and message formatting logic
- `apps/daemon/src/harness/runner.ts` — Effect-TS `EffectHarnessRunner` multi-phase runtime loop
- `apps/daemon/src/api/approvals.ts` — Effect `Deferred` approval suspension & SSE notification bridge
- `packages/protocol/src/index.ts` — Wire protocol event schemas

---

## 1. Execution Lifecycle (Plan → Execute → Verify)

Every autonomous task submitted via `POST /api/sessions/:id/prompt` executes inside a scoped Effect fiber (`EffectHarnessRunner.runPrompt`) managed by the daemon:

1. **Planning (`orchestrator_phase: "planning"`):**
   - Creates a 3-step execution plan (`plan_inspect`, `plan_execute`, `plan_verify`) via `createInitialPlan(prompt)` and broadcasts `plan_update`.
   - Rehydrates prior messages from the latest SQLite `checkpoints` row if resuming an existing session.
   - On fresh sessions, executes `inspect_workspace` and injects a grounded system prompt (`buildOrchestratorSystemPrompt`) listing workspace root entries, `package.json` scripts, git branch, and tool risk policies.
2. **Executing (`orchestrator_phase: "executing"`):**
   - Runs a bounded multi-turn inference loop (default `maxSteps: 12`, max `30`).
   - Before each model call, runs `compactMessagesForBudget(messages, 64_000)` to shrink oversized historical tool outputs while keeping the system prompt, initial user prompt, and the 6 most recent turns intact.
   - Streams tokens, reasoning traces, tool calls, token usage, and gateway failover notices over SSE in real time.
3. **Verifying (`orchestrator_phase: "verifying"`):**
   - Transitions automatically when read-only verification tools follow a mutating step, or when the model produces its final synthesized answer without further tool calls.
4. **Terminal States (`completed` | `failed` | `interrupted`):**
   - Persists final session status in SQLite `sessions` and emits terminal `orchestrator_phase` + `status_change` events.
   - On fiber interruption (`POST /api/sessions/:id/abort`), `Effect.onInterrupt` automatically cancels pending approvals and marks the session `interrupted`.

---

## 2. Parallel Read Batching vs. Sequential Gated Writes

`partitionToolCalls(toolCalls, isReadOnlyTool)` preserves causal ordering while maximizing throughput:

- **Consecutive read-only calls** (`inspect_workspace`, `read_file`, `list_files`, `glob_files`, `grep_search`, `git_status`) are grouped into a `parallel` batch and executed concurrently (`Effect.all(..., { concurrency: 4 })`).
- **Mutating or runtime calls** (`write_file`, `edit_file`, `delete_file`, `execute_command`) are isolated into individual `sequential` batches so each change executes deterministically and prompts for user approval one action at a time.

---

## 3. Durable Intent, Approvals & Doom-Loop Protection

- **Durable Intent Before Dispatch:** Before invoking any tool, the runner writes and broadcasts `tool_intent` with deterministic `actionId = action_${runId}_${callId}` to JSONL (`events.jsonl`) and SQLite (`session_events`).
- **Effect `Deferred` Approval Gate:** `ApprovalManager.requestApproval()` auto-approves read-only tools (`isReadOnlyTool`) and suspends mutating/exec calls (unless `autoApprove: true`) on a 10-minute bounded `Deferred`, persisting the pending row in SQLite `approvals` and immediately firing `onApprovalRequired` to emit `approval_required` over SSE.
- **Spec-Compliant Multi-Turn Tool History:** `buildToolTurnMessages()` appends the assistant turn containing `toolCalls` followed by a `role: "tool"` turn containing `toolResults: [{ callId, toolName, content, isError }]`, ensuring multi-turn tool outputs are never dropped across steps.
- **Doom-Loop Guard:** `checkDoomLoop()` halts execution if 3 consecutive identical `(toolName, args)` invocations fail, preventing runaway token burn.
- **Tier 4 Model Guard:** Weak local models (`ollama:*`, `llama3.2`) are blocked from autonomous tool execution (`TIER4_TOOLS_BLOCKED`) unless explicitly opted in via `allowTier4Tools: true`.

---

## 4. Protocol Events & Endpoints

| Endpoint | Purpose |
| :--- | :--- |
| `POST /api/sessions` | Create and persist a harness session in SQLite `sessions` |
| `GET /api/sessions` | List persisted harness sessions |
| `GET /api/sessions/:id/state` | Inspect session status, pending approvals, and recent events |
| `GET /api/sessions/:id/events` | Real-time SSE stream (`orchestrator_phase`, `plan_update`, `step_started`, `token_delta`, `reasoning_delta`, `tool_intent`, `tool_call`, `tool_result`, `approval_required`, `gateway_fallback`, `turn_usage`, `status_change`) |
| `POST /api/sessions/:id/prompt` | Dispatch a task to `EffectHarnessRunner` with automatic provider/fallback resolution |
| `GET /api/sessions/:id/approvals` | Query pending approvals |
| `POST /api/sessions/:id/approvals/:approvalId` | Approve or reject a gated tool call |
| `POST /api/sessions/:id/abort` | Interrupt active Effect fiber and cancel pending approvals |
