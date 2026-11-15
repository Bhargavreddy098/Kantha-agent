import { NextResponse } from 'next/server';
import { GatewayError } from '@/lib/gateway/contracts/errors';
import { validateCreateSessionInput } from '@/lib/gateway/contracts/validation';
import { readGatewayJson, withGatewayIngress } from '@/lib/gateway/server/ingress';
import { getGatewayRegistry } from '@/lib/gateway/server/registry';


export const GET = withGatewayIngress(async (_req, ctx) => {
  const sessions = await getGatewayRegistry().runService.listSessions(ctx);
  return NextResponse.json({ sessions, total: sessions.length });
});

export const POST = withGatewayIngress(async (req, ctx) => {
  const validated = validateCreateSessionInput(await readGatewayJson(req, 4096), ctx.requestId);
  if (!validated.ok) throw new GatewayError(validated.error);
  if (validated.data.workspaceId !== undefined && validated.data.workspaceId !== ctx.workspaceId) {
    throw new GatewayError({ code: 'forbidden', message: 'You cannot create a session in that workspace.', requestId: ctx.requestId });
  }
  if ((validated.data.title?.length ?? 0) > 160) {
    throw new GatewayError({ code: 'invalid_request', message: 'Session title exceeds 160 characters.', requestId: ctx.requestId });
  }
  const session = await getGatewayRegistry().runService.createSession({ title: validated.data.title }, ctx);
  return NextResponse.json(session, { status: 201 });
});
