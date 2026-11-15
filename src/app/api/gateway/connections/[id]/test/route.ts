import { NextResponse } from 'next/server';
import { requireGatewayOwner, withGatewayIngress } from '@/lib/gateway/server/ingress';
import { getGatewayRegistry } from '@/lib/gateway/server/registry';
import { createGatewayError } from '@/lib/gateway/contracts/errors';

export const POST = withGatewayIngress<{ id: string }>(async (_req, ctx, { id }) => {
  requireGatewayOwner(ctx);
  const { connectionStore, secretStore, inferenceAdapter } = getGatewayRegistry();
  const connection = await connectionStore.getConnection(id, ctx);
  if (!connection || connection.status === 'revoked') {
    throw createGatewayError({ code: 'not_found', message: 'Provider connection was not found.' });
  }
  const secret = connection.secretRef ? await secretStore.getSecret(connection.secretRef, ctx) : null;
  if (connection.secretRef && !secret) {
    throw createGatewayError({ code: 'conflict', message: 'Provider credentials changed. Refresh the connection and try again.' });
  }
  const result = await inferenceAdapter.testConnection(connection, secret ?? undefined);
  const current = await connectionStore.recordConnectionTest(id, connection.revision, result, ctx);
  if (!current) {
    throw createGatewayError({ code: 'conflict', message: 'Provider settings changed during the test. Refresh and try again.' });
  }
  return NextResponse.json(result);
});
