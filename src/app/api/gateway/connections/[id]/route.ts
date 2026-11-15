import { NextResponse } from 'next/server';
import { readGatewayJson, requireGatewayOwner, withGatewayIngress } from '@/lib/gateway/server/ingress';
import { getGatewayRegistry } from '@/lib/gateway/server/registry';
import { validateUpdateConnectionInput } from '@/lib/gateway/contracts/validation';
import { createGatewayError, GatewayError } from '@/lib/gateway/contracts/errors';
import { normalizeProviderEndpoint } from '@/lib/gateway/providers/egress';
import { publicConnection } from '@/lib/gateway/server/public-connection';

export const GET = withGatewayIngress<{ id: string }>(async (_req, ctx, { id }) => {
  requireGatewayOwner(ctx);
  const connection = await getGatewayRegistry().connectionStore.getConnection(id, ctx);
  if (!connection) throw createGatewayError({ code: 'not_found', message: 'Provider connection was not found.' });
  return NextResponse.json(publicConnection(connection));
});

export const PATCH = withGatewayIngress<{ id: string }>(async (req, ctx, { id }) => {
  requireGatewayOwner(ctx);
  const validated = validateUpdateConnectionInput(await readGatewayJson(req, 8192), ctx.requestId);
  if (!validated.ok) throw new GatewayError(validated.error);
  const { endpoint, label, apiKey, status, providerType } = validated.data;
  const connection = await getGatewayRegistry().connectionStore.updateConnection(id, {
    endpoint: endpoint !== undefined ? normalizeProviderEndpoint(endpoint) : undefined,
    label,
    apiKey,
    status,
    providerType,
  }, ctx);
  return NextResponse.json(publicConnection(connection));
});

export const DELETE = withGatewayIngress<{ id: string }>(async (_req, ctx, { id }) => {
  requireGatewayOwner(ctx);
  const deleted = await getGatewayRegistry().connectionStore.deleteConnection(id, ctx);
  if (!deleted) throw createGatewayError({ code: 'not_found', message: 'Provider connection was not found.' });
  return new NextResponse(null, { status: 204 });
});
