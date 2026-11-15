import { NextResponse } from 'next/server';
import { GatewayError } from '@/lib/gateway/contracts/errors';
import { readGatewayJson, withGatewayIngress } from '@/lib/gateway/server/ingress';
import { getGatewayRegistry } from '@/lib/gateway/server/registry';


export const POST = withGatewayIngress<{ id: string }>(async (req, ctx, { id }) => {
  if (!id) {
    throw new GatewayError({ code: 'invalid_request', message: 'Run ID is required.', requestId: ctx.requestId });
  }

  const body = await readGatewayJson(req, 4096);
  const reason: unknown = body && typeof body === 'object' && 'reason' in body ? body.reason : undefined;
  if (reason !== undefined && (typeof reason !== 'string' || reason.length > 256)) {
    throw new GatewayError({ code: 'invalid_request', message: 'Cancel reason must be a short string.', requestId: ctx.requestId });
  }

  const run = await getGatewayRegistry().runService.cancelRun(id, reason ?? 'User requested cancellation', ctx);
  return NextResponse.json(run);
});
