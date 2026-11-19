import { randomUUID } from 'node:crypto';
import type { RequestContext } from '../gateway/contracts/context';
import type { GatewayEvent, GatewayEventType } from '../gateway/contracts/event';
import { createGatewayError } from '../gateway/contracts/errors';
import type {
  IHarnessProjection,
  IHarnessStore,
  NewHarnessEvent,
  StoredHarnessEvent,
  HarnessAdmission,
  HarnessOutcome,
  HarnessScope,
} from './contracts';
import type { Collection, GatewayDatabase } from '../gateway/server/storage/database';
import type { GatewayRunService } from '../gateway/runs/session-service';

/** Adapts the gateway document store to the injected harness store interface. */
export class GatewayHarnessStore implements IHarnessStore {
  constructor(private readonly db: GatewayDatabase) {}

  write<T>(operation: () => T): T {
    return this.db.write(operation);
  }

  get<T>(collection: string, scope: string, id: string): T | null {
    return this.db.get<T>(collection as Collection, scope, id);
  }

  list<T>(collection: string, scope: string): T[] {
    return this.db.list<T>(collection as Collection, scope);
  }

  put<T>(collection: string, scope: string, id: string, value: T): void {
    this.db.put(collection as Collection, scope, id, value);
  }

  appendEvent(scope: string, event: NewHarnessEvent): StoredHarnessEvent {
    const recorded = this.db.appendEvent(scope, { ...event, sequence: 0 } as GatewayEvent);
    return recorded as StoredHarnessEvent;
  }

  readEvents(scope: string, sessionId: string, cursor: number, limit: number): StoredHarnessEvent[] {
    return this.db.readEvents(scope, sessionId, cursor, limit) as StoredHarnessEvent[];
  }
}

function toRequestContext(scope: HarnessScope): RequestContext {
  return {
    requestId: scope.requestId,
    workspaceId: scope.workspaceId,
    caller: { type: 'user', id: scope.actorId },
    timestamp: Date.now(),
  };
}

/** Projects durable harness state into the existing gateway run and SSE contracts. */
export class GatewayHarnessProjection implements IHarnessProjection {
  constructor(private readonly db: GatewayDatabase, private readonly runs: GatewayRunService) {}

  async appendAssistantText(runId: string, messageId: string, delta: string, scope: HarnessScope): Promise<void> {
    await this.runs.appendAssistantDelta(runId, messageId, delta, toRequestContext(scope));
  }

  signal(runId: string, scope: HarnessScope): AbortSignal {
    return this.runs.getRunSignal(runId, toRequestContext(scope));
  }

  publish(type: string, runId: string, data: Record<string, unknown>, scope: HarnessScope): void {
    const admission = this.db.get<HarnessAdmission>('harness_admissions', scope.workspaceId, `run:${runId}`);
    if (!admission) return;
    this.db.appendEvent(scope.workspaceId, {
      id: `evt_${randomUUID()}`,
      sessionId: admission.sessionId,
      runId,
      type: type as GatewayEventType,
      sequence: 0,
      occurredAt: new Date().toISOString(),
      data,
    });
  }

  async finish(runId: string, outcome: HarnessOutcome, scope: HarnessScope): Promise<void> {
    await this.runs.finishRun(runId, {
      status: outcome.status,
      reason: outcome.reason,
      error: outcome.status === 'failed'
        ? createGatewayError({
            code: 'harness_failed',
            message: outcome.reason ?? 'Harness verification failed.',
            requestId: scope.requestId,
          }).toEnvelope()
        : undefined,
    }, toRequestContext(scope));
  }
}
