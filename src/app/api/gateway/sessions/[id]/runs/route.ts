import { NextResponse } from 'next/server';
import { GatewayError } from '@/lib/gateway/contracts/errors';
import { readGatewayJson, withGatewayIngress } from '@/lib/gateway/server/ingress';
import { getGatewayRegistry } from '@/lib/gateway/server/registry';

export const POST = withGatewayIngress<{ id: string }>(async (req, ctx, { id }) => {
  if (!id) {
    throw new GatewayError({ code: 'invalid_request', message: 'Session ID is required.', requestId: ctx.requestId });
  }

  const input = await readGatewayJson(req);
  const { run, replayed } = await getGatewayRegistry().chatService.submitSessionRun(input, id, ctx);
  return NextResponse.json(run, { status: replayed ? 200 : 201 });
});
