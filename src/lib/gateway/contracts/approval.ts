/**
 * Gateway Approvals & Tool Interaction Contracts
 * Route endpoints:
 *   GET, POST /api/gateway/approvals
 *   GET, POST /api/gateway/approvals/:approvalId
 */

export type ApprovalStatus =
  | 'waiting'
  | 'deciding'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'interrupted';

export interface GatewayApproval {
  id: string;
  runId: string;
  sessionId: string;
  workspaceId: string;
  actionVersion: number;
  toolName: string;
  summary: string;
  parameters: Record<string, unknown>;
  status: ApprovalStatus;
  actorId?: string;
  reason?: string;
  createdAt: string;
  expiresAt: string;
  resolvedAt?: string;
}

export interface ResolveApprovalInput {
  decision: 'approve' | 'reject';
  actionVersion: number;
  reason?: string;
}

export interface InertToolFixtureAction {
  toolName: 'inert_fixture_tool';
  action: 'execute_test_probe';
  target: string;
  parameters: Record<string, unknown>;
}
