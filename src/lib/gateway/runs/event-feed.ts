import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import type { IEventFeedService } from '../contracts/adapters';
import type { GatewayEvent } from '../contracts/event';
import type { RequestContext } from '../contracts/context';
import { GatewayError } from '../contracts/errors';
import type { GatewayDatabase } from '../server/storage/database';
import type { SessionRecord } from './state';

export class GatewayEventFeedService implements IEventFeedService {
  constructor(
    private readonly db: GatewayDatabase,
    private readonly recoverSession: (session: SessionRecord, ctx: RequestContext) => void,
  ) {}

  async *subscribe(sessionId: string, cursor: number, ctx: RequestContext, signal?: AbortSignal): AsyncIterable<GatewayEvent> {
    const initial = this.db.get<SessionRecord>('sessions', ctx.workspaceId, sessionId);
    if (!initial || initial.session.status === 'deleted') {
      throw new GatewayError({ code: 'not_found', message: 'Session not found', requestId: ctx.requestId, resource: sessionId });
    }
    let lastRecoveryCheck = 0;
    while (!signal?.aborted) {
      const session = this.db.get<SessionRecord>('sessions', ctx.workspaceId, sessionId);
      if (!session || session.session.status === 'deleted') return;
      if (Date.now() - lastRecoveryCheck >= 1_000) {
        this.recoverSession(session, ctx);
        lastRecoveryCheck = Date.now();
      }

      const { oldest, latest } = this.db.eventBounds(ctx.workspaceId, sessionId);
      if (cursor > latest || (oldest > 0 && cursor < oldest - 1)) {
        yield {
          id: `evt_${randomUUID()}`,
          type: 'resync.requested',
          sessionId,
          sequence: latest,
          occurredAt: new Date().toISOString(),
          data: { reason: 'The cursor is outside the replay window.', expectedCursor: cursor, latestWatermark: latest },
        };
        return;
      }

      // Polling the shared journal avoids gaps between replay and live delivery, including across Node workers.
      const events = this.db.readEvents(ctx.workspaceId, sessionId, cursor, 64);
      if (events.length > 0 && events[0].sequence !== cursor + 1) continue;
      for (const event of events) {
        if (signal?.aborted) return;
        cursor = event.sequence;
        yield event;
      }
      if (events.length === 0) {
        try {
          await delay(250, undefined, { signal });
        } catch (error) {
          if (signal?.aborted) return;
          throw error;
        }
      }
    }
  }
}
