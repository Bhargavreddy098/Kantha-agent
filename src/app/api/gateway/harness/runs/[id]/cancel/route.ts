import { NextResponse } from 'next/server';
import { withGatewayIngress, readGatewayJson } from '@/lib/gateway/server/ingress';
import { getGatewayRegistry } from '@/lib/gateway/server/registry';
import { harnessScope } from '@/lib/harness/service';
import { harnessRouteError } from '@/lib/harness/route-error';

export const POST = withGatewayIngress<{ id: string }>(async (req, ctx, { id }) => {
  try {
    const input = await readGatewayJson(req);
    const reason = input && typeof input === 'object' && typeof (input as { reason?: unknown }).reason === 'string'
      ? (input as { reason: string }).reason
      : undefined;
    await getGatewayRegistry().harness.service.cancel(id, reason, harnessScope(ctx));
    return NextResponse.json({ runId: id, status: 'cancelled' });
  } catch (error) {
    throw harnessRouteError(error, ctx.requestId);
  }
});
