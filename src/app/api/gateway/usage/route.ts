import { NextRequest, NextResponse } from 'next/server';
import { withGatewayIngress } from '@/lib/gateway/server/ingress';
import { getGatewayRegistry } from '@/lib/gateway/server/registry';
import { RequestContext } from '@/lib/gateway/contracts/context';

export const GET = withGatewayIngress(async (_req: NextRequest, ctx: RequestContext) => {
  const registry = getGatewayRegistry();
  const summary = await registry.usageService.getUsage(ctx);
  return NextResponse.json(summary);
});
