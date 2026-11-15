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
  | 'heartbeat';

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
