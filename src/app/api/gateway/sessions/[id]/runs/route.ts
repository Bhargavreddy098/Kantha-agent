import { NextResponse } from 'next/server';
import { GatewayError } from '@/lib/gateway/contracts/errors';
import { startGatewayChat } from '@/lib/gateway/providers/chat-service';
import { readGatewayJson, withGatewayIngress } from '@/lib/gateway/server/ingress';


export const POST = withGatewayIngress<{ id: string }>(async (req, ctx, { id }) => {
  if (!id) {
    throw new GatewayError({ code: 'invalid_request', message: 'Session ID is required.', requestId: ctx.requestId });
  }

  const { run, response, replayed } = await startGatewayChat(await readGatewayJson(req), ctx, id);

  // The event journal is the response channel for this endpoint. The independent consumer
  // inside startGatewayChat keeps the provider stream alive until the run reaches a terminal state.
  void response.body?.cancel().catch(() => {});
  return NextResponse.json(run, { status: replayed ? 200 : 201 });
});
