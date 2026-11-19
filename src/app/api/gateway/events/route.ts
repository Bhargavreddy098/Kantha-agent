import { randomUUID } from 'node:crypto';
import type { GatewayEvent } from '@/lib/gateway/contracts/event';
import { GatewayError } from '@/lib/gateway/contracts/errors';
import { withGatewayIngress } from '@/lib/gateway/server/ingress';
import { getGatewayRegistry } from '@/lib/gateway/server/registry';


const eventHeaders = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-store, no-transform',
  'X-Accel-Buffering': 'no',
};
const HEARTBEAT = Symbol('heartbeat');
const encoder = new TextEncoder();

function eventFrame(event: GatewayEvent): string {
  const id = event.type === 'resync.requested' ? '' : `id: ${event.sequence}\n`;
  return `${id}data: ${JSON.stringify(event)}\n\n`;
}

export const GET = withGatewayIngress(async (req, ctx) => {
  const query = new URL(req.url).searchParams;
  const sessionId = query.get('sessionId') ?? query.get('session_id');
  if (!sessionId || sessionId.length > 256 || sessionId === '*') {
    throw new GatewayError({ code: 'invalid_request', message: 'A session ID is required for events.', requestId: ctx.requestId });
  }

  const registry = getGatewayRegistry();
  const session = await registry.runService.getSession(sessionId, ctx);
  if (!session) {
    throw new GatewayError({ code: 'not_found', message: 'Session not found.', requestId: ctx.requestId });
  }

  const rawCursor = req.headers.get('last-event-id') || query.get('cursor');
  if (rawCursor === null) {
    return new Response(eventFrame({
      id: randomUUID(),
      type: 'resync.requested',
      sessionId,
      sequence: session.lastEventSequence,
      occurredAt: new Date().toISOString(),
      data: { reason: 'A session snapshot is required.', expectedCursor: 0, latestWatermark: session.lastEventSequence },
    }), { headers: eventHeaders });
  }
  const cursor = Number(rawCursor);
  if (!/^\d+$/.test(rawCursor) || !Number.isSafeInteger(cursor)) {
    throw new GatewayError({ code: 'invalid_request', message: 'Event cursor must be a non-negative integer.', requestId: ctx.requestId });
  }

  req.signal.throwIfAborted();
  const release = registry.eventCapacity.acquire(ctx);
  const disconnect = new AbortController();
  const stop = () => {
    release();
    disconnect.abort();
  };
  req.signal.addEventListener('abort', stop, { once: true, signal: disconnect.signal });
  const signal = AbortSignal.any([req.signal, disconnect.signal]);
  const subscription = registry.eventFeed.subscribe(sessionId, cursor, ctx, signal)[Symbol.asyncIterator]();
  let next: Promise<IteratorResult<GatewayEvent>> | undefined;

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(': connected\n\n'));
    },
    async pull(controller) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        // Retain the in-flight iterator read when a heartbeat wins. A slow client
        // only pulls one event at a time, so the response does not queue the journal.
        next ??= subscription.next();
        const heartbeat = new Promise<typeof HEARTBEAT>((resolve) => {
          timer = setTimeout(() => resolve(HEARTBEAT), 15_000);
        });
        const item = await Promise.race([next, heartbeat]);
        if (signal.aborted) {
          controller.close();
          stop();
          return;
        }
        if (item === HEARTBEAT) {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
          return;
        }
        next = undefined;
        if (!item.done) controller.enqueue(encoder.encode(eventFrame(item.value)));
        if (item.done || item.value.type === 'resync.requested') {
          controller.close();
          stop();
          await subscription.return?.();
        }
      } catch {
        if (!disconnect.signal.aborted) controller.close();
        stop();
        await subscription.return?.();
      } finally {
        clearTimeout(timer);
      }
    },
    async cancel() {
      stop();
      await subscription.return?.();
    },
  });

  return new Response(body, { headers: eventHeaders });
});
