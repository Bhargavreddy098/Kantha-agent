import { NextResponse } from 'next/server';
import { withGatewayIngress } from '@/lib/gateway/server/ingress';
import { getGatewayRegistry } from '@/lib/gateway/server/registry';
import { harnessScope } from '@/lib/harness/service';
import { harnessRouteError } from '@/lib/harness/route-error';

export const GET = withGatewayIngress<{ id: string }>(async (_req, ctx, { id }) => {
  try {
    const view = await getGatewayRegistry().harness.service.view(id, harnessScope(ctx));
    if (!view) {
      return NextResponse.json({ code: 'not_found', message: 'Harness run not found.', requestId: ctx.requestId }, { status: 404 });
    }
    return NextResponse.json(view);
  } catch (error) {
    throw harnessRouteError(error, ctx.requestId);
  }
});
