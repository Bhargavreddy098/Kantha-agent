import { NextResponse } from 'next/server';
import { GatewayError } from '@/lib/gateway/contracts/errors';
import { withGatewayIngress } from '@/lib/gateway/server/ingress';
import { getGatewayRegistry } from '@/lib/gateway/server/registry';


export const GET = withGatewayIngress<{ id: string }>(async (_req, ctx, { id }) => {
  if (!id) {
    throw new GatewayError({ code: 'invalid_request', message: 'Session ID is required.', requestId: ctx.requestId });
  }
  const snapshot = await getGatewayRegistry().runService.getSnapshot(id, ctx);
  return NextResponse.json(snapshot, { headers: { 'Cache-Control': 'no-store' } });
});

export const DELETE = withGatewayIngress<{ id: string }>(async (_req, ctx, { id }) => {
  if (!id) {
    throw new GatewayError({ code: 'invalid_request', message: 'Session ID is required.', requestId: ctx.requestId });
  }
  const deleted = await getGatewayRegistry().runService.deleteSession(id, ctx);
  if (!deleted) {
    throw new GatewayError({ code: 'not_found', message: 'Session not found.', requestId: ctx.requestId });
  }
  return NextResponse.json({ success: true, id });
});
