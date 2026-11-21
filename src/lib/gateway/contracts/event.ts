/**
 * Gateway SSE & Event Feed Contracts
 * Route endpoints:
 *   GET /api/gateway/events?sessionId=...&cursor=... (SSE)
 */

import type { RunStatus } from './run';
import type { GatewayApproval } from './approval';
import type { AttemptAccounting } from './usage';

export type GatewayEventType =
  | 'server.connected'
  | 'run.state_changed'
  | 'run.delta'
  | 'approval.requested'
  | 'approval.resolved'
  | 'usage.updated'
  | 'run.completed'
  | 'run.failed'
  | 'run.cancelled'
  | 'resync.requested'
  | 'heartbeat'
  // Versioned harness projection events. These carry safe run/step/verification
  // state; raw model prompts and tool payloads stay out of the public feed.
  | 'harness.step'
  | 'harness.delta'
  | 'harness.message_delta'
  | 'harness.tool_proposed'
  | 'harness.tool_result'
  | 'harness.verification'
  | 'harness.handoff';

export interface GatewayEvent<T = unknown> {
  id: string;
  type: GatewayEventType;
  sessionId: string;
  runId?: string;
  sequence: number;
  occurredAt: string;
  data: T;
}

export interface RunStateChangedPayload {
  previousState: RunStatus;
  newState: RunStatus;
  reason?: string;
}

export interface RunDeltaPayload {
  delta: string;
  role: 'assistant';
  partIndex?: number;
}

export type ApprovalRequestedPayload = GatewayApproval;

export interface ApprovalResolvedPayload {
  approvalId: string;
  decision: 'approved' | 'rejected';
  actorId?: string;
  reason?: string;
}

export type UsageUpdatedPayload = AttemptAccounting;

export interface RunCompletedPayload {
  runId: string;
  finishReason: string;
  totalTokens?: number;
}

export interface RunFailedPayload {
  runId: string;
  error: {
    code: string;
    message: string;
    retryAfterSeconds?: number;
  };
}

export interface ResyncRequestedPayload {
  reason: string;
  expectedCursor: number;
  latestWatermark: number;
}

/** Stable identity of one harness journal entry, used for client dedupe. */
export interface HarnessEventPayload {
  sourceEventId: string;
  sequence: number;
  step: number;
  runId: string;
}

export interface HarnessToolEventPayload extends HarnessEventPayload {
  callId: string;
  tool: string;
  status?: string;
}

export interface HarnessVerificationEventPayload extends HarnessEventPayload {
  verdict: 'completed' | 'failed';
  candidateDigest: string;
  failedCriteria: string[];
}

export interface HarnessHandoffEventPayload extends HarnessEventPayload {
  outcome: {
    status: 'completed' | 'failed' | 'cancelled' | 'interrupted';
    reason?: string;
    diffDigest?: string;
    nextAction?: string;
  };
}
