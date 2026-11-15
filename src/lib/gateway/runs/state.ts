import { randomUUID } from 'node:crypto';
import type { GatewayEvent } from '../contracts/event';
import type { GatewayRun, RunStatus } from '../contracts/run';
import type { GatewaySession } from '../contracts/session';
import type { UIMessage } from '../contracts/chat';
import type { GatewayDatabase } from '../server/storage/database';

export interface SessionRecord {
  session: GatewaySession;
  latestRunId?: string;
  messages: UIMessage[];
}

export interface RunRecord {
  run: GatewayRun;
  payloadDigest?: string;
  leaseUntil?: number;
}

export function isActive(status: RunStatus): boolean {
  return status === 'running' || status === 'queued' || status === 'waiting_for_approval';
}

export function recordSessionEvent(
  db: GatewayDatabase,
  record: SessionRecord,
  type: GatewayEvent['type'],
  data: unknown,
  runId?: string,
): GatewayEvent {
  const occurredAt = new Date().toISOString();
  const event = db.appendEvent(record.session.workspaceId, {
    id: `evt_${randomUUID()}`,
    sessionId: record.session.id,
    runId,
    type,
    sequence: 0,
    occurredAt,
    data,
  });
  record.session.lastEventSequence = event.sequence;
  record.session.updatedAt = occurredAt;
  db.put('sessions', record.session.workspaceId, record.session.id, record);
  return event;
}

/** Writes the terminal run and its event as part of the caller's transaction. */
export function endRun(
  db: GatewayDatabase,
  session: SessionRecord,
  record: RunRecord,
  status: Extract<RunStatus, 'completed' | 'failed' | 'cancelled' | 'interrupted'>,
  reason?: string,
): void {
  const previousState = record.run.status;
  record.run.status = status;
  record.run.completedAt = new Date().toISOString();
  record.run.pendingApprovalId = undefined;
  record.leaseUntil = undefined;
  if (session.session.activeRunId === record.run.id) session.session.activeRunId = undefined;
  db.put('runs', session.session.workspaceId, record.run.id, record);
  recordSessionEvent(db, session, 'run.state_changed', { previousState, newState: status, reason }, record.run.id);
}
