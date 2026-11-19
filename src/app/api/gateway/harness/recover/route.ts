import { NextResponse } from 'next/server';
import { withGatewayIngress } from '@/lib/gateway/server/ingress';
import { getGatewayRegistry } from '@/lib/gateway/server/registry';
import { harnessScope } from '@/lib/harness/service';
import { harnessRouteError } from '@/lib/harness/route-error';

export const POST = withGatewayIngress(async (_req, ctx) => {
  try {
    const outcomes = await getGatewayRegistry().harness.service.recoverOpen(harnessScope(ctx));
    return NextResponse.json({ recovered: outcomes.length, outcomes });
  } catch (error) {
    throw harnessRouteError(error, ctx.requestId);
  }
});
