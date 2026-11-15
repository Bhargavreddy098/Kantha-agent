/**
 * Gateway Run Contracts
 * Route endpoints:
 *   POST /api/gateway/sessions/:id/runs
 *   POST /api/gateway/runs/:id/cancel
 *   GET /api/gateway/sessions/:id
 */

import type { GatewayErrorEnvelope } from './errors';
import type { GatewaySession } from './session';
import type { UIMessage } from './chat';
import type { GatewayApproval } from './approval';

export type RunStatus =
  | 'queued'
  | 'running'
  | 'waiting_for_approval'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'interrupted';

export interface GatewayRun {
  id: string;
  sessionId: string;
  workspaceId: string;
  submissionKey: string;
  status: RunStatus;
  modelId: string;
  connectionId: string;
  pendingApprovalId?: string;
  error?: GatewayErrorEnvelope;
  startedAt: string;
  completedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface SubmitRunInput {
  sessionId: string;
  submissionKey: string;
  modelId: string;
  connectionId?: string;
  inputMessages: UIMessage[];
  system?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface CancelRunInput {
  reason?: string;
}

export interface RunSnapshot {
  session: GatewaySession;
  run: GatewayRun | null;
  pendingApproval?: GatewayApproval;
  messages: UIMessage[];
  eventCursor: number;
  watermark: number;
}
