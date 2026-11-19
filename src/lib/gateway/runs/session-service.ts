import { createHash, randomUUID } from 'node:crypto';
import type { IRunService } from '../contracts/adapters';
import type { GatewayApproval } from '../contracts/approval';
import type { UIMessage } from '../contracts/chat';
import type { RequestContext } from '../contracts/context';
import { GatewayError, type GatewayErrorEnvelope } from '../contracts/errors';
import type { GatewayRun, RunSnapshot, SubmitRunInput } from '../contracts/run';
import type { CreateSessionInput, GatewaySession } from '../contracts/session';
import type { GatewayApprovalService } from '../server/approval-service';
import type { GatewayDatabase } from '../server/storage/database';
import { endRun, isActive, recordSessionEvent, type RunRecord, type SessionRecord } from './state';

interface EndRunInput {
  status: 'completed' | 'failed' | 'cancelled' | 'interrupted';
  message?: UIMessage;
  messages?: UIMessage[];
  error?: GatewayErrorEnvelope;
  reason?: string;
}

interface RunSignal {
  controller: AbortController;
  poll: ReturnType<typeof setInterval>;
}

const runLeaseMs = 15_000;

function normalizedJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizedJson);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => [key, normalizedJson(entry)]));
  }
  return value;
}

function digest(input: SubmitRunInput): string {
  return createHash('sha256').update(JSON.stringify(normalizedJson(input))).digest('hex');
}

function mergeMessages(existing: UIMessage[], updates: UIMessage[]): UIMessage[] {
  const result = new Map(existing.map((message) => [message.id, message]));
  for (const message of updates) result.set(message.id, message);
  return [...result.values()];
}

export class GatewayRunService implements IRunService {
  private readonly signals = new Map<string, RunSignal>();

  constructor(private readonly db: GatewayDatabase, private readonly approvals: GatewayApprovalService) {}

  private requireSession(id: string, ctx: RequestContext): SessionRecord {
    const record = this.db.get<SessionRecord>('sessions', ctx.workspaceId, id);
    if (!record || record.session.status === 'deleted') {
      throw new GatewayError({ code: 'not_found', message: 'Session not found', requestId: ctx.requestId, resource: id });
    }
    return record;
  }

  private refreshActiveRun(record: SessionRecord, ctx: RequestContext, prefetched?: RunRecord): SessionRecord {
    const id = record.session.activeRunId;
    if (!id) return record;
    const stored = prefetched ?? this.db.get<RunRecord>('runs', ctx.workspaceId, id);
    if (!stored) throw new Error('The active run is missing from gateway storage.');

    if (stored.run.pendingApprovalId) {
      this.approvals.refresh(stored.run.pendingApprovalId, ctx);
      return this.requireSession(record.session.id, ctx);
    }
    if (stored.leaseUntil !== undefined && stored.leaseUntil <= Date.now()) {
      endRun(this.db, record, stored, 'interrupted', 'The gateway lost contact with this run');
    }
    return record;
  }

  recoverSession(session: GatewaySession, ctx: RequestContext): void {
    const id = session.activeRunId;
    if (!id) return;
    const stored = this.db.get<RunRecord>('runs', ctx.workspaceId, id);
    const approval = stored?.run.pendingApprovalId
      ? this.db.get<GatewayApproval>('approvals', ctx.workspaceId, stored.run.pendingApprovalId)
      : null;
    const now = Date.now();
    if ((stored?.leaseUntil !== undefined && stored.leaseUntil <= now) ||
      (approval && (approval.status === 'waiting' || approval.status === 'deciding') && Date.parse(approval.expiresAt) <= now)) {
      this.db.write(() => this.refreshActiveRun(this.requireSession(session.id, ctx), ctx));
    }
  }

  async listSessions(ctx: RequestContext, limit?: number, offset?: number): Promise<GatewaySession[]> {
    return this.db.write(() => {
      const sessions = this.db.listSessionMetadata(ctx.workspaceId, limit, offset);
      const runs = this.db.getMany<RunRecord>('runs', ctx.workspaceId,
        sessions.flatMap(({ activeRunId }) => activeRunId ? [activeRunId] : []));
      const now = Date.now();
      return sessions.map((session) => {
        if (!session.activeRunId) return session;
        const stored = runs.get(session.activeRunId);
        if (!stored) throw new Error('The active run is missing from gateway storage.');
        if (!stored.run.pendingApprovalId && (stored.leaseUntil === undefined || stored.leaseUntil > now)) return session;
        return this.refreshActiveRun(this.requireSession(session.id, ctx), ctx, stored).session;
      });
    });
  }

  async createSession(input: CreateSessionInput, ctx: RequestContext): Promise<GatewaySession> {
    return this.db.write(() => {
      const id = `ses_${randomUUID()}`;
      const now = new Date().toISOString();
      const session: GatewaySession = {
        id,
        workspaceId: ctx.workspaceId,
        title: input.title ?? 'New Gateway Session',
        status: 'active',
        lastEventSequence: 0,
        createdAt: now,
        updatedAt: now,
        metadata: input.metadata,
      };
      this.db.put('sessions', ctx.workspaceId, id, { session, messages: [] });
      return session;
    });
  }

  async getSession(id: string, ctx: RequestContext): Promise<GatewaySession | null> {
    const session = this.db.getSessionMetadata(ctx.workspaceId, id);
    return session?.status === 'deleted' ? null : session;
  }

  async deleteSession(id: string, ctx: RequestContext): Promise<boolean> {
    return this.db.write(() => {
      const stored = this.db.get<SessionRecord>('sessions', ctx.workspaceId, id);
      if (!stored || stored.session.status === 'deleted') return false;
      const record = this.refreshActiveRun(stored, ctx);
      if (record.session.activeRunId) {
        throw new GatewayError({ code: 'conflict', message: 'Cancel the active run before deleting this session', requestId: ctx.requestId, resource: id });
      }
      record.session.status = 'deleted';
      record.session.updatedAt = new Date().toISOString();
      record.messages = [];
      this.db.deleteSessionEvents(ctx.workspaceId, id);
      this.db.put('sessions', ctx.workspaceId, id, record);
      return true;
    });
  }

  private findSubmission(input: SubmitRunInput, ctx: RequestContext): GatewayRun | null {
    const key = JSON.stringify([input.sessionId, input.submissionKey]);
    const runId = this.db.get<string>('submissions', ctx.workspaceId, key);
    if (!runId) return null;
    const stored = this.db.get<RunRecord>('runs', ctx.workspaceId, runId);
    if (!stored) throw new Error('The stored submission has no associated run.');
    if (stored.payloadDigest !== digest(input)) {
      throw new GatewayError({ code: 'conflict', message: 'This submission key belongs to a different request', requestId: ctx.requestId });
    }
    return stored.run;
  }

  async getRunBySubmission(input: SubmitRunInput, ctx: RequestContext): Promise<GatewayRun | null> {
    return this.db.write(() => {
      this.refreshActiveRun(this.requireSession(input.sessionId, ctx), ctx);
      return this.findSubmission(input, ctx);
    });
  }

  async beginRun(input: SubmitRunInput, ctx: RequestContext): Promise<{ run: GatewayRun; created: boolean }> {
    return this.db.write(() => {
      const session = this.refreshActiveRun(this.requireSession(input.sessionId, ctx), ctx);
      const existing = this.findSubmission(input, ctx);
      if (existing) return { run: existing, created: false };
      if (session.session.activeRunId || session.session.status !== 'active') {
        throw new GatewayError({ code: 'conflict', message: 'This session cannot start another run yet', requestId: ctx.requestId, resource: input.sessionId });
      }

      const known = new Map(session.messages.map((message) => [message.id, message]));
      const messageCount = known.size;
      for (const message of input.inputMessages) {
        const previous = known.get(message.id);
        if (previous && (previous.role !== message.role || previous.content !== message.content)) {
          throw new GatewayError({ code: 'conflict', message: 'This message ID already has different content', requestId: ctx.requestId });
        }
        if (!previous) known.set(message.id, message);
      }
      if (known.size === messageCount) {
        throw new GatewayError({ code: 'conflict', message: 'This run needs a new message', requestId: ctx.requestId });
      }

      const run: GatewayRun = {
        id: `run_${randomUUID()}`,
        sessionId: input.sessionId,
        workspaceId: ctx.workspaceId,
        submissionKey: input.submissionKey,
        status: 'running',
        modelId: input.modelId,
        connectionId: input.connectionId ?? '',
        startedAt: new Date().toISOString(),
      };
      const stored: RunRecord = { run, payloadDigest: digest(input), leaseUntil: Date.now() + runLeaseMs };
      this.db.put('runs', ctx.workspaceId, run.id, stored);
      this.db.put('submissions', ctx.workspaceId, JSON.stringify([input.sessionId, input.submissionKey]), run.id);
      session.session.activeRunId = run.id;
      session.latestRunId = run.id;
      session.messages = [...known.values()];
      recordSessionEvent(this.db, session, 'run.state_changed', { previousState: 'queued', newState: 'running' }, run.id);
      return { run, created: true };
    });
  }

  async submitRun(input: SubmitRunInput, ctx: RequestContext): Promise<GatewayRun> {
    return (await this.beginRun(input, ctx)).run;
  }

  async getRun(id: string, ctx: RequestContext): Promise<GatewayRun | null> {
    return this.db.write(() => {
      const stored = this.db.get<RunRecord>('runs', ctx.workspaceId, id);
      if (!stored) return null;
      const session = this.db.get<SessionRecord>('sessions', ctx.workspaceId, stored.run.sessionId);
      if (!session || session.session.status === 'deleted') return null;
      this.refreshActiveRun(session, ctx);
      return this.db.get<RunRecord>('runs', ctx.workspaceId, id)?.run ?? null;
    });
  }

  async getSnapshot(sessionId: string, ctx: RequestContext): Promise<RunSnapshot> {
    return this.db.write(() => {
      const session = this.refreshActiveRun(this.requireSession(sessionId, ctx), ctx);
      const run = session.latestRunId ? this.db.get<RunRecord>('runs', ctx.workspaceId, session.latestRunId)?.run : undefined;
      const pendingApproval = run?.pendingApprovalId
        ? this.db.get<GatewayApproval>('approvals', ctx.workspaceId, run.pendingApprovalId)
        : undefined;
      return {
        session: session.session,
        run: run ?? null,
        pendingApproval: pendingApproval ?? undefined,
        messages: session.messages,
        eventCursor: session.session.lastEventSequence,
        watermark: session.session.lastEventSequence,
      };
    });
  }

  async appendAssistantDelta(runId: string, messageId: string, delta: string, ctx: RequestContext): Promise<void> {
    if (!delta) return;
    this.db.write(() => {
      const stored = this.db.get<RunRecord>('runs', ctx.workspaceId, runId);
      if (!stored || stored.run.status !== 'running') return;
      const session = this.requireSession(stored.run.sessionId, ctx);
      if (session.session.activeRunId !== runId) return;
      const previous = session.messages.find((message) => message.id === messageId);
      const content = (previous?.content ?? '') + delta;
      session.messages = mergeMessages(session.messages, [{
        id: messageId, role: 'assistant', content, parts: [{ type: 'text', text: content }],
      }]);
      recordSessionEvent(this.db, session, 'run.delta', { delta, role: 'assistant', messageId }, runId);
    });
  }

  async finishRun(id: string, input: EndRunInput, ctx: RequestContext): Promise<GatewayRun> {
    const run = this.db.write(() => {
      const stored = this.db.get<RunRecord>('runs', ctx.workspaceId, id);
      if (!stored) throw new GatewayError({ code: 'not_found', message: 'Run not found', requestId: ctx.requestId, resource: id });
      const session = this.requireSession(stored.run.sessionId, ctx);
      if (!isActive(stored.run.status)) return stored.run;
      if (stored.run.pendingApprovalId) {
        const approval = this.db.get<GatewayApproval>('approvals', ctx.workspaceId, stored.run.pendingApprovalId);
        if (approval) {
          approval.status = 'interrupted';
          approval.actorId = ctx.caller.id;
          approval.resolvedAt = new Date().toISOString();
          this.db.put('approvals', ctx.workspaceId, approval.id, approval);
          recordSessionEvent(this.db, session, 'approval.resolved', { approvalId: approval.id, decision: 'interrupted' }, id);
        }
      }
      const messages = input.message ? [input.message] : (input.messages ?? []);
      session.messages = mergeMessages(session.messages, messages);
      stored.run.error = input.error;
      endRun(this.db, session, stored, input.status, input.reason ?? input.error?.message);
      return stored.run;
    });
    this.stopSignal(ctx.workspaceId, id, run.status === 'cancelled' || run.status === 'interrupted');
    return run;
  }

  async cancelRun(id: string, reason: string | undefined, ctx: RequestContext): Promise<GatewayRun> {
    return this.finishRun(id, { status: 'cancelled', reason }, ctx);
  }

  getRunSignal(id: string, ctx: RequestContext, requestSignal?: AbortSignal): AbortSignal {
    const key = JSON.stringify([ctx.workspaceId, id]);
    const existing = this.signals.get(key);
    if (existing) return requestSignal ? AbortSignal.any([requestSignal, existing.controller.signal]) : existing.controller.signal;

    const controller = new AbortController();
    const checkRun = () => {
      try {
        const stored = this.db.get<RunRecord>('runs', ctx.workspaceId, id);
        if (stored?.run.status !== 'running' || !stored.leaseUntil) {
          this.stopSignal(ctx.workspaceId, id, true);
          return;
        }
        if (stored.leaseUntil - Date.now() < runLeaseMs - 5_000) {
          const renewed = this.db.write(() => {
            const fresh = this.db.get<RunRecord>('runs', ctx.workspaceId, id);
            if (fresh?.run.status !== 'running' || !fresh.leaseUntil || fresh.leaseUntil <= Date.now()) return false;
            fresh.leaseUntil = Date.now() + runLeaseMs;
            this.db.put('runs', ctx.workspaceId, id, fresh);
            return true;
          });
          if (!renewed) this.stopSignal(ctx.workspaceId, id, true);
        }
      } catch {
        this.stopSignal(ctx.workspaceId, id, true);
      }
    };
    const poll = setInterval(checkRun, 250);
    poll.unref();
    this.signals.set(key, { controller, poll });
    checkRun();
    return requestSignal ? AbortSignal.any([requestSignal, controller.signal]) : controller.signal;
  }

  private stopSignal(scope: string, id: string, abort: boolean): void {
    const key = JSON.stringify([scope, id]);
    const signal = this.signals.get(key);
    if (signal) {
      clearInterval(signal.poll);
      this.signals.delete(key);
      if (abort) signal.controller.abort();
    }
  }

  shutdown(): void {
    for (const signal of this.signals.values()) {
      clearInterval(signal.poll);
      signal.controller.abort();
    }
    this.signals.clear();
  }

  async createInertApproval(sessionId: string, ctx: RequestContext): Promise<GatewayApproval> {
    return this.db.write(() => {
      const session = this.refreshActiveRun(this.requireSession(sessionId, ctx), ctx);
      if (session.session.activeRunId || session.session.status !== 'active') {
        throw new GatewayError({ code: 'conflict', message: 'Finish the active run before starting an approval test', requestId: ctx.requestId, resource: sessionId });
      }

      const now = new Date();
      const runId = `run_${randomUUID()}`;
      const approval: GatewayApproval = {
        id: `approval_${randomUUID()}`,
        runId,
        sessionId,
        workspaceId: ctx.workspaceId,
        actionVersion: 1,
        toolName: 'inert_fixture_tool',
        summary: 'Run the gateway approval self-test',
        parameters: { target: 'gateway-self-test' },
        status: 'waiting',
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 5 * 60_000).toISOString(),
      };
      const run: GatewayRun = {
        id: runId,
        sessionId,
        workspaceId: ctx.workspaceId,
        submissionKey: `inert_${randomUUID()}`,
        status: 'waiting_for_approval',
        modelId: '',
        connectionId: '',
        startedAt: now.toISOString(),
        pendingApprovalId: approval.id,
      };
      this.db.put('runs', ctx.workspaceId, runId, { run });
      this.db.put('approvals', ctx.workspaceId, approval.id, approval);
      session.session.activeRunId = runId;
      session.latestRunId = runId;
      recordSessionEvent(this.db, session, 'run.state_changed', { previousState: 'queued', newState: 'waiting_for_approval' }, runId);
      recordSessionEvent(this.db, session, 'approval.requested', approval, runId);
      return approval;
    });
  }
}
