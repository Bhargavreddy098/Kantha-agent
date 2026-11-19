import { NextResponse } from 'next/server';
import { withGatewayIngress, readGatewayJson } from '@/lib/gateway/server/ingress';
import { getGatewayRegistry } from '@/lib/gateway/server/registry';
import { harnessScope } from '@/lib/harness/service';
import { harnessRouteError } from '@/lib/harness/route-error';

export const POST = withGatewayIngress(async (req, ctx) => {
  try {
    const input = await readGatewayJson(req);
    const result = await getGatewayRegistry().harness.service.submit(input, harnessScope(ctx));
    return NextResponse.json(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    throw harnessRouteError(error, ctx.requestId);
  }
});
