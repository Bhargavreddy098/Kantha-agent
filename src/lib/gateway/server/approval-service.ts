import type { IApprovalService } from '../contracts/adapters';
import type { GatewayApproval, ResolveApprovalInput } from '../contracts/approval';
import type { RequestContext } from '../contracts/context';
import { GatewayError } from '../contracts/errors';
import { endRun, recordSessionEvent, type RunRecord, type SessionRecord } from '../runs/state';
import type { GatewayDatabase } from './storage/database';

const inertTool = 'inert_fixture_tool';

export class GatewayApprovalService implements IApprovalService {
  constructor(private readonly db: GatewayDatabase) {}

  async getPendingApproval(runId: string, ctx: RequestContext): Promise<GatewayApproval | null> {
    return this.db.write(() => {
      const run = this.db.get<RunRecord>('runs', ctx.workspaceId, runId);
      return run?.run.pendingApprovalId ? this.refresh(run.run.pendingApprovalId, ctx) : null;
    });
  }

  async getApprovalById(approvalId: string, ctx: RequestContext): Promise<GatewayApproval | null> {
    return this.db.write(() => this.refresh(approvalId, ctx));
  }

  async listApprovals(ctx: RequestContext): Promise<GatewayApproval[]> {
    return this.db.write(() => this.db.list<GatewayApproval>('approvals', ctx.workspaceId)
      .map((approval) => this.refresh(approval.id, ctx) ?? approval));
  }

  // Called inside the run or approval transaction so expiry is durable before returning a snapshot.
  refresh(approvalId: string, ctx: RequestContext): GatewayApproval | null {
    const approval = this.db.get<GatewayApproval>('approvals', ctx.workspaceId, approvalId);
    if (!approval || (approval.status !== 'waiting' && approval.status !== 'deciding')) return approval;
    if (Date.parse(approval.expiresAt) > Date.now()) return approval;

    approval.status = 'expired';
    approval.resolvedAt = new Date().toISOString();
    this.db.put('approvals', ctx.workspaceId, approvalId, approval);
    const run = this.db.get<RunRecord>('runs', ctx.workspaceId, approval.runId);
    const session = this.db.get<SessionRecord>('sessions', ctx.workspaceId, approval.sessionId);
    if (run?.run.status === 'waiting_for_approval' && session?.session.activeRunId === run.run.id) {
      recordSessionEvent(this.db, session, 'approval.resolved', { approvalId, decision: 'expired' }, run.run.id);
      endRun(this.db, session, run, 'interrupted', 'Approval expired');
    }
    return approval;
  }

  async resolveApproval(approvalId: string, input: ResolveApprovalInput, ctx: RequestContext): Promise<GatewayApproval> {
    return this.db.write(() => {
      const approval = this.refresh(approvalId, ctx);
      if (!approval) {
        throw new GatewayError({ code: 'not_found', message: 'Approval request not found', requestId: ctx.requestId, resource: approvalId });
      }
      if (approval.status === 'expired') return approval;
      if (input.actionVersion !== approval.actionVersion) {
        throw new GatewayError({ code: 'conflict', message: 'The pending action changed', requestId: ctx.requestId, resource: approvalId });
      }
      const decision = input.decision === 'approve' ? 'approved' : 'rejected';
      if (approval.status === decision) return approval;
      if ((approval.status !== 'waiting' && approval.status !== 'deciding') || approval.toolName !== inertTool) {
        throw new GatewayError({ code: 'conflict', message: 'Approval is no longer pending', requestId: ctx.requestId, resource: approvalId });
      }

      const run = this.db.get<RunRecord>('runs', ctx.workspaceId, approval.runId);
      const session = this.db.get<SessionRecord>('sessions', ctx.workspaceId, approval.sessionId);
      if (run?.run.status !== 'waiting_for_approval' || session?.session.activeRunId !== run.run.id || run.run.pendingApprovalId !== approvalId) {
        throw new GatewayError({ code: 'conflict', message: 'The pending run changed', requestId: ctx.requestId, resource: approvalId });
      }

      approval.status = decision;
      approval.actorId = ctx.caller.id;
      if (input.reason !== undefined) approval.reason = input.reason;
      approval.resolvedAt = new Date().toISOString();
      this.db.put('approvals', ctx.workspaceId, approvalId, approval);
      // The only supported action is inert. Its result and decision commit together.
      this.db.put('audit', ctx.workspaceId, approvalId, {
        approvalId,
        runId: run.run.id,
        actionVersion: approval.actionVersion,
        toolName: approval.toolName,
        actorId: ctx.caller.id,
        outcome: decision === 'approved' ? 'inert_probe_completed' : 'inert_probe_rejected',
        occurredAt: approval.resolvedAt,
      });
      recordSessionEvent(this.db, session, 'approval.resolved', { approvalId, decision, actorId: ctx.caller.id }, run.run.id);
      endRun(this.db, session, run, decision === 'approved' ? 'completed' : 'cancelled', input.reason);
      return approval;
    });
  }
}
