# Design Specification: Autonomous Harness Runner & GatewayService Integration

**Date**: 2026-11-23  
**Status**: Approved  
**Author**: Antigravity & Lead Architect  
**Domain**: Autonomous Execution Engine (`apps/daemon`, `packages/gateway`, `packages/protocol`)

---

## 1. Intent & Problem Statement

Kantha's daemon currently features a robust, fully verified `@kantha/gateway` Phase 1 implementation (encrypted vault, live upstream streaming, SSRF protection, SQLite ledger, and dynamic intelligence tiers) and an Astryx Web Workbench. However, the autonomous harness runner in `apps/daemon/src/harness/runner.ts` remains a hardcoded stub that emits a mock `list_files` event. 

To transition Kantha from a single-turn chat streaming UI into a true multi-turn autonomous coding assistant (modeled after OpenCode and Claude Code), `EffectHarnessRunner` must be wired directly to `GatewayService.stream`. 

Autonomous tool loops introduce five critical failure modes that this design directly addresses:
1. **Workspace escapes**: Path traversal (`..\`), symlink escapes, or Windows drive switching (`C:\...`).
2. **Unchecked mutations**: Blindly running commands or overwriting files without user approval.
3. **Runaway loops & cost burn**: Infinite tool loops, failing doom loops, and unbounded token spend on low-capability models.
4. **Oversized tool payloads**: Giant file reads or verbose build logs crashing the context window or exhausting process memory.
5. **Lossy history**: Dropping reasoning signatures or parallel tool call IDs across multi-turn exchanges, causing upstream provider rejections.

---

## 2. Approaches Considered & Selection

### Approach A: Pure In-Fiber State Machine Loop (Selected)
- **Architecture**: `EffectHarnessRunner` runs as a continuous Effect workflow (`Effect.gen`). Each turn is an autonomous step inside an interruptible fiber:
  1. Rehydrates authoritative history from SQLite `checkpoints.stateSnapshot` as `KanthaMessage[]`.
  2. Evaluates Tier 4 model preflight restrictions (Option B: strict fail-fast block with `TIER4_TOOLS_BLOCKED` unless explicitly overridden).
  3. Checks session budget via `LedgerStore.checkBudget(sessionId)` before each step.
  4. Evaluates doom-loop detection (aborting on 3 consecutive identical failing calls).
  5. Invokes `GatewayService.stream` with current `KanthaMessage[]` history and active tool definitions.
  6. Accumulates text deltas, reasoning deltas (with provider metadata/signatures), and parallel tool calls.
  7. Emits typed protocol events (`step_started`, `reasoning_delta`, `text_delta`, `turn_usage`).
  8. Persists durable intent (`action_${runId}_${callId}`) before side effects.
  9. Passes mutating tools (`write_file`, `execute_command`) through `ApprovalManager` (suspending fiber on `Deferred` until resolved or auto-approving in test mode).
  10. Executes approved tools inside `Effect.scoped` with canonical ancestor-aware path checking and incremental output truncation.
  11. Appends assistant and tool result messages into history and loops until done or `maxSteps` reached.
  12. Cleans up pending approvals on fiber interrupt/abort via `Effect.onInterrupt`.
- **Why Selected**: 100% native Effect concurrency. Fibers can be cleanly cancelled (`Fiber.interrupt`) when the user aborts a run or disconnects, cleanly killing child processes via Scope without leaving zombie processes.

### Approach B: Discrete Step Driver / Generator
- **Architecture**: Runner exposes `step(): Promise<StepResult>`, orchestrated by an external outer loop.
- **Why Rejected**: External orchestration breaks Effect's structured concurrency, resource `Scope` guarantees, and unified fiber interruption. Cancelling a run mid-tool requires manual `AbortController` plumbing across disparate services.

### Approach C: AI SDK Built-in `streamText({ maxSteps })`
- **Architecture**: Delegating the entire multi-step loop to Vercel AI SDK's built-in `maxSteps`.
- **Why Rejected**: The internal loop runs inside a single function invocation, making interactive approval suspension (`ApprovalManager`), per-step budget checking, per-step durable SQLite intent logging, and custom doom-loop detection impossible.

---

## 3. Detailed Architecture & Guardrails

### Guardrail 1: Workspace Containment & Approval Gates
- **Canonical Path Containment (Symlink & New-File Safe)**:
  All filesystem tools (`read_file`, `write_file`, `list_files`) must resolve target paths using canonical ancestor-aware resolution:
  ```ts
  export function resolveSafeWorkspacePath(workspacePath: string, targetPath: string): string {
    const realWorkspace = fs.realpathSync(workspacePath);
    const resolved = path.resolve(realWorkspace, targetPath);

    // Walk up to the nearest existing ancestor to resolve real physical path without failing on new files
    let cur = resolved;
    const missingSegments: string[] = [];
    while (!fs.existsSync(cur)) {
      const parent = path.dirname(cur);
      if (parent === cur) break;
      missingSegments.unshift(path.basename(cur));
      cur = parent;
    }

    const realExistingAncestor = fs.realpathSync(cur);
    const realTarget = path.join(realExistingAncestor, ...missingSegments);

    // Normalize relative path comparison (case-insensitive on win32)
    const rel = path.relative(realWorkspace, realTarget);
    const isEscaping = rel.startsWith("..") || path.isAbsolute(rel);

    if (process.platform === "win32") {
      const normWorkspace = realWorkspace.toLowerCase();
      const normTarget = realTarget.toLowerCase();
      if (!normTarget.startsWith(normWorkspace + path.sep) && normTarget !== normWorkspace) {
        throw new Error(`Access denied: path '${targetPath}' escapes workspace root.`);
      }
    } else {
      if (isEscaping) {
        throw new Error(`Access denied: path '${targetPath}' escapes workspace root.`);
      }
    }
    return resolved;
  }
  ```
- **Approval Gating (`apps/daemon/src/api/approvals.ts`)**:
  - **Read-Only Tools** (`read_file`, `list_files`): Auto-approved immediately.
  - **Mutating Tools** (`write_file`, `execute_command`):
    - Policy `ask` (default): Inserts a row in SQLite `approvals` table (`status: "pending"`), emits `approval_required` event to clients, and suspends the runner fiber on an Effect `Deferred<ToolApprovalDecision>`.
    - Clients approve/reject via `POST /api/sessions/:id/approvals/:approvalId`. Upon resolution, the deferred fiber wakes up.
    - Policy `auto`: Enabled strictly when `autoApprove: true` is set in runner options (for automated integration tests).
    - If rejected by the user: returns `{ output: "Tool execution was rejected by user.", isError: true }` as `ToolResult` back to the model without crashing the loop.
  - **Abort Cleanup**: On fiber interruption (`Effect.onInterrupt`), the runner immediately cancels any pending approvals in SQLite (`status: "cancelled"`), ensuring `GET /api/sessions/:id/approvals` never returns stale ghost approvals.

### Guardrail 2: Loop & Tier 4 Guardrails
- **Configurable `maxSteps`**:
  Default to 15 turns (configurable via options between 1 and 50). When reached without completion, the runner gracefully stops and returns a `MaxStepsReached` summary.
- **Doom-Loop Detection**:
  Tracks the signature of the last 3 tool calls: `hash(toolName + ":" + JSON.stringify(args))`. If 3 consecutive calls have the same signature and result in errors, the runner breaks the loop with:
  `"Doom loop detected: identical failing tool call repeated 3 times. Stopping to prevent token waste."`
- **Per-Step Budget Enforcement**:
  Before starting step $N$, the runner invokes `LedgerStore.checkBudget(sessionId)`. If total spend exceeds the session ceiling, the run transitions to `failed` and terminates immediately.
- **Tier 4 Multi-Tool Restriction (Option B: Strict Block)**:
  Prior to execution, the runner resolves the model tier via `CatalogService.getTier(providerId, modelId)`. If Tier 4 (free, unverified local, or low-parameter model) and tool calling is requested without `allowTier4Tools: true`, the runner halts immediately and returns:
  `HTTP 400 Bad Request`  
  `{ error: "Model does not reliably support autonomous tool calling", code: "TIER4_TOOLS_BLOCKED", providerId, modelId, tier: 4 }`  
  This allows clients (such as the Astryx UI) to present an actionable choice: "Switch to a Tier 1/2 BYOK model" or "Run anyway with allowTier4Tools: true".

### Guardrail 3: Bounded Tool Execution & Recoverable Errors
- **Incremental Output Truncation**:
  - `read_file`: Capped at 2,000 lines or 64 KB. If exceeded, returns first 64 KB with `\n[Output truncated: remaining content omitted]`.
  - `execute_command`: Caps captured stdout and stderr **incrementally during streaming chunks** (does not buffer unbounded gigabytes in memory). Once the cumulative buffer reaches 32 KB (32,768 bytes), incoming data is dropped and `\n[Output truncated: reached 32KB cap]` is appended.
- **Execution Timeouts & Process Scope**:
  `execute_command` runs with a default 30-second timeout, pinned to `realWorkspace` as `cwd`. Process execution is wrapped under Effect `Scope` (`makeManagedPty` or child process killer) so that fiber interruption forcefully kills the child process tree (`taskkill /F /T /PID` on Windows, `kill -9` on POSIX).
- **Recoverable Errors**:
  Tool exceptions (file not found, syntax error, command non-zero exit code, path traversal rejection) are caught and formatted as `{ output: string, isError: true }`. They are yielded as valid `KanthaToolResult` messages back to the model rather than crashing the harness fiber, allowing the LLM to inspect the error and adjust its strategy.

### Guardrail 4: Lossless Multi-Turn Round-Tripping & Durable Intent
- **Durable Intent Logging**:
  Before executing any side-effecting tool (`write_file`, `execute_command`), the harness persists an intent record in SQLite `session_events` with ID `action_${runId}_${callId}` (`eventType: "tool_intent"`, status `dispatched`). Once completed, a matching `eventType: "tool_result"` event records `status: "completed" | "failed"`. Scoping by `runId` guarantees zero collisions even when providers reuse short IDs like `call_1`.
- **Lossless History Preservation (`KanthaMessage[]`)**:
  The runner stores and checkpoints canonical `KanthaMessage[]` structures:
  - If the assistant emits reasoning, it is stored in `assistant.reasonings` preserving `providerMetadata` and cryptographic signatures.
  - All parallel tool calls in a turn are preserved in `assistant.toolCalls`.
  - Every tool call has a matching `tool` result message referencing the exact `callId` and `toolName`.
  - `GatewayService.stream` accepts `InferenceRequest` with `KanthaMessage[]`, handling all provider-specific translation inside `@kantha/gateway`.

### Guardrail 5: Protocol Bridge for Milestone 2 (`packages/protocol`)
The protocol is expanded to include typed events that Milestone 2 UI components can stream without modifying the runner:
```ts
export const StepStartedEvent = Schema.Struct({
  type: Schema.Literal("step_started"),
  sessionId: Schema.String,
  stepIndex: Schema.Number,
  maxSteps: Schema.Number,
  timestamp: Schema.Number,
});

export const ReasoningDeltaEvent = Schema.Struct({
  type: Schema.Literal("reasoning_delta"),
  sessionId: Schema.String,
  delta: Schema.String,
  timestamp: Schema.Number,
});

export const TurnUsageEvent = Schema.Struct({
  type: Schema.Literal("turn_usage"),
  sessionId: Schema.String,
  stepIndex: Schema.Number,
  modelId: Schema.String,
  tier: Schema.Literal(1, 2, 3, 4),
  inputTokens: Schema.Number,
  outputTokens: Schema.Number,
  reasoningTokens: Schema.Number,
  costUsd: Schema.Number,
  timestamp: Schema.Number,
});

export const ToolIntentEvent = Schema.Struct({
  type: Schema.Literal("tool_intent"),
  sessionId: Schema.String,
  runId: Schema.String,
  callId: Schema.String,
  actionId: Schema.String,
  toolName: Schema.String,
  args: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
  timestamp: Schema.Number,
});
```
`GatewayService.stream` terminal delta emits `{ finishReason, usage, costUsd }` so the runner emits `TurnUsageEvent` immediately without additional SQLite queries or redundant cost math.

---

## 4. REST & SSE Endpoints

1. `POST /api/sessions`: Create an autonomous session with workspace path and model configuration.
2. `POST /api/sessions/:id/prompt`: Submit a user prompt to start or continue an autonomous run. Returns HTTP 409 Conflict if a run is already active.
3. `GET /api/sessions/:id/events`: SSE stream delivering real-time harness events (`step_started`, `token_delta`, `reasoning_delta`, `tool_call`, `approval_required`, `tool_result`, `turn_usage`, `status_change`).
4. `GET /api/sessions/:id/approvals`: Retrieve active pending approvals for reconnecting clients.
5. `POST /api/sessions/:id/approvals/:approvalId`: Resolve a pending tool approval (`decision: "approve" | "reject"`).
6. `POST /api/sessions/:id/abort`: Cancel the active autonomous fiber, kill child process trees, and mark pending approvals as `cancelled`.

---

## 5. Verification Plan

1. **Unit Tests (`apps/daemon/src/harness/__tests__/runner.test.ts`)**:
   - Multi-turn execution completing a task via tool calls against mock gateway.
   - Workspace escape prevention (rejecting `../`, symlinks to parent/foreign folders, and absolute foreign drive paths; allowing new file creation in subdirectories).
   - Approval gate: pausing on `write_file` / `execute_command`, resuming on approval, returning error on rejection, cancelling on abort.
   - Doom-loop detection: aborting on 3 consecutive identical failing calls.
   - Budget check enforcement: halting immediately when session budget is exhausted.
   - Tier 4 restriction: blocking unapproved multi-tool runs on Tier 4 models with `TIER4_TOOLS_BLOCKED`.
   - Incremental output truncation on streaming command output (>32 KB).
   - Recovery from non-zero exit codes.
2. **Integration Test (`apps/daemon/src/harness/__tests__/runner-live.test.ts`)**:
   - End-to-end multi-turn coding task in a scratch directory (e.g., creating a file, reading it back, and summarizing its contents).
3. **Monorepo Typecheck & Test Suite**:
   - `pnpm run -r typecheck` with 0 errors across all packages and apps.
   - All gateway, daemon, and web test suites passing.
