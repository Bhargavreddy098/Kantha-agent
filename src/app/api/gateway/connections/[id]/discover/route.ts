import { NextResponse } from 'next/server';
import { requireGatewayOwner, withGatewayIngress } from '@/lib/gateway/server/ingress';
import { getGatewayRegistry } from '@/lib/gateway/server/registry';

export const POST = withGatewayIngress<{ id: string }>(async (_req, ctx, { id }) => {
  requireGatewayOwner(ctx);
  return NextResponse.json(await getGatewayRegistry().modelCatalog.discoverModels(id, ctx));
});
