/**
 * Gateway Session Contracts
 * Route endpoints:
 *   GET /api/gateway/sessions
 *   POST /api/gateway/sessions
 *   GET /api/gateway/sessions/:id
 *   DELETE /api/gateway/sessions/:id
 */

export type SessionStatus = 'active' | 'archived' | 'deleted';

export interface GatewaySession {
  id: string;
  workspaceId: string;
  title: string;
  status: SessionStatus;
  activeRunId?: string;
  lastEventSequence: number;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface CreateSessionInput {
  title?: string;
  workspaceId?: string;
  metadata?: Record<string, unknown>;
}

export interface SessionSummary {
  id: string;
  title: string;
  status: SessionStatus;
  hasActiveRun: boolean;
  updatedAt: string;
}
