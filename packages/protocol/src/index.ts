import { Schema } from "effect";

// ==========================================
// 1. Session Entities & Schemas
// ==========================================

export const SessionStatus = Schema.Literal("idle", "running", "paused", "completed", "failed");
export type SessionStatus = typeof SessionStatus.Type;

export const SessionSchema = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  workspacePath: Schema.String,
  createdAt: Schema.Number,
  updatedAt: Schema.Number,
  status: SessionStatus,
});
export type Session = typeof SessionSchema.Type;

export const CreateSessionRequest = Schema.Struct({
  title: Schema.optionalWith(Schema.String, { default: () => "New Session" }),
  workspacePath: Schema.optionalWith(Schema.String, { default: () => process.cwd() }),
});
export type CreateSessionRequest = typeof CreateSessionRequest.Type;

// ==========================================
// 2. Prompt & Execution Schemas
// ==========================================

export const SubmitPromptRequest = Schema.Struct({
  prompt: Schema.String,
  modelId: Schema.optionalWith(Schema.String, { default: () => "claude-3-5-sonnet" }),
  scope: Schema.optional(Schema.Array(Schema.String)),
});
export type SubmitPromptRequest = typeof SubmitPromptRequest.Type;

// ==========================================
// 3. Tool & Approval Schemas
// ==========================================

export const ApprovalStatus = Schema.Literal("pending", "approved", "rejected");
export type ApprovalStatus = typeof ApprovalStatus.Type;

export const ToolApproval = Schema.Struct({
  id: Schema.String,
  sessionId: Schema.String,
  callId: Schema.String,
  toolName: Schema.String,
  args: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
  status: ApprovalStatus,
  createdAt: Schema.Number,
});
export type ToolApproval = typeof ToolApproval.Type;

export const ResolveApprovalRequest = Schema.Struct({
  approvalId: Schema.String,
  decision: Schema.Literal("approve", "reject"),
  feedback: Schema.optional(Schema.String),
});
export type ResolveApprovalRequest = typeof ResolveApprovalRequest.Type;

// ==========================================
// 4. Real-time Event Schemas (SSE Stream)
// ==========================================

export const TokenDeltaEvent = Schema.Struct({
  type: Schema.Literal("token_delta"),
  sessionId: Schema.String,
  text: Schema.String,
  timestamp: Schema.Number,
});
export type TokenDeltaEvent = typeof TokenDeltaEvent.Type;

export const ToolCallEvent = Schema.Struct({
  type: Schema.Literal("tool_call"),
  sessionId: Schema.String,
  callId: Schema.String,
  toolName: Schema.String,
  args: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
  timestamp: Schema.Number,
});
export type ToolCallEvent = typeof ToolCallEvent.Type;

export const ToolResultEvent = Schema.Struct({
  type: Schema.Literal("tool_result"),
  sessionId: Schema.String,
  callId: Schema.String,
  toolName: Schema.String,
  output: Schema.String,
  isError: Schema.Boolean,
  timestamp: Schema.Number,
});
export type ToolResultEvent = typeof ToolResultEvent.Type;

export const ApprovalRequiredEvent = Schema.Struct({
  type: Schema.Literal("approval_required"),
  sessionId: Schema.String,
  approval: ToolApproval,
  timestamp: Schema.Number,
});
export type ApprovalRequiredEvent = typeof ApprovalRequiredEvent.Type;

export const StatusChangeEvent = Schema.Struct({
  type: Schema.Literal("status_change"),
  sessionId: Schema.String,
  status: SessionStatus,
  error: Schema.optional(Schema.String),
  timestamp: Schema.Number,
});
export type StatusChangeEvent = typeof StatusChangeEvent.Type;

export const StepStartedEvent = Schema.Struct({
  type: Schema.Literal("step_started"),
  sessionId: Schema.String,
  stepIndex: Schema.Number,
  maxSteps: Schema.Number,
  timestamp: Schema.Number,
});
export type StepStartedEvent = typeof StepStartedEvent.Type;

export const ReasoningDeltaEvent = Schema.Struct({
  type: Schema.Literal("reasoning_delta"),
  sessionId: Schema.String,
  delta: Schema.String,
  timestamp: Schema.Number,
});
export type ReasoningDeltaEvent = typeof ReasoningDeltaEvent.Type;

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
export type TurnUsageEvent = typeof TurnUsageEvent.Type;

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
export type ToolIntentEvent = typeof ToolIntentEvent.Type;

export const KanthaEvent = Schema.Union(
  TokenDeltaEvent,
  ToolCallEvent,
  ToolResultEvent,
  ApprovalRequiredEvent,
  StatusChangeEvent,
  StepStartedEvent,
  ReasoningDeltaEvent,
  TurnUsageEvent,
  ToolIntentEvent
);
export type KanthaEvent = typeof KanthaEvent.Type;
