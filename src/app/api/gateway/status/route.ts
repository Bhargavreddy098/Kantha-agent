import { NextRequest, NextResponse } from 'next/server';
import { withGatewayIngress } from '@/lib/gateway/server/ingress';
import { getGatewayRegistry } from '@/lib/gateway/server/registry';
import { RequestContext } from '@/lib/gateway/contracts/context';

export const GET = withGatewayIngress(async (_req: NextRequest, ctx: RequestContext) => {
  const registry = getGatewayRegistry();
  const sessions = await registry.runService.listSessions(ctx);
  const activeSessions = sessions.filter((s) => s.status === 'active').length;
  const activeRuns = sessions.filter((s) => s.activeRunId !== undefined).length;

  const status = registry.lifecycle.getGatewayStatus(ctx, {
    activeSessions,
    activeRuns,
  });

  return NextResponse.json(status);
});
