import { NextResponse } from 'next/server';
import { readGatewayJson, requireGatewayOwner, withGatewayIngress } from '@/lib/gateway/server/ingress';
import { getGatewayRegistry } from '@/lib/gateway/server/registry';
import { validateCreateConnectionInput } from '@/lib/gateway/contracts/validation';
import { GatewayError } from '@/lib/gateway/contracts/errors';
import { normalizeProviderEndpoint } from '@/lib/gateway/providers/egress';
import { publicConnection } from '@/lib/gateway/server/public-connection';

export const GET = withGatewayIngress(async (_req, ctx) => {
  requireGatewayOwner(ctx);
  const connections = (await getGatewayRegistry().connectionStore.listConnections(ctx)).map(publicConnection);
  return NextResponse.json({ connections, total: connections.length });
});

export const POST = withGatewayIngress(async (req, ctx) => {
  requireGatewayOwner(ctx);
  const validated = validateCreateConnectionInput(await readGatewayJson(req, 8192), ctx.requestId);
  if (!validated.ok) throw new GatewayError(validated.error);
  const { label, providerType, apiKey, endpoint } = validated.data;
  const connection = await getGatewayRegistry().connectionStore.createConnection({
    label,
    providerType,
    apiKey,
    endpoint: normalizeProviderEndpoint(endpoint),
  }, ctx);
  return NextResponse.json(publicConnection(connection), { status: 201 });
});
