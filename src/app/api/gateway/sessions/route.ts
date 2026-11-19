import { NextResponse } from 'next/server';
import { GatewayError } from '@/lib/gateway/contracts/errors';
import { validateCreateSessionInput } from '@/lib/gateway/contracts/validation';
import { readGatewayJson, withGatewayIngress } from '@/lib/gateway/server/ingress';
import { getGatewayRegistry } from '@/lib/gateway/server/registry';


export const GET = withGatewayIngress(async (req, ctx) => {
  const service = getGatewayRegistry().runService;
  const { searchParams } = req.nextUrl;
  if (!searchParams.has('limit') && !searchParams.has('offset')) {
    const sessions = await service.listSessions(ctx);
    return NextResponse.json({ sessions, total: sessions.length });
  }

  const limit = Number(searchParams.get('limit') ?? 50);
  const offset = Number(searchParams.get('offset') ?? 0);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 ||
      !Number.isSafeInteger(offset) || offset < 0 || offset > Number.MAX_SAFE_INTEGER - limit) {
    throw new GatewayError({
      code: 'invalid_request', requestId: ctx.requestId,
      message: 'Use a limit from 1 to 100 and a non-negative offset.',
    });
  }

  const page = await service.listSessions(ctx, limit + 1, offset);
  const sessions = page.slice(0, limit);
  return NextResponse.json({
    sessions,
    total: sessions.length,
    nextOffset: page.length > limit ? offset + limit : null,
  });
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
