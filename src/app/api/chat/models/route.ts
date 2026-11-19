import { NextResponse } from 'next/server';
import { withGatewayIngress } from '@/lib/gateway/server/ingress';
import { getGatewayRegistry } from '@/lib/gateway/server/registry';

export const GET = withGatewayIngress(async (_req, ctx) => {
  const { modelCatalog, connectionStore } = getGatewayRegistry();
  const [models, connections] = await Promise.all([
    modelCatalog.listModels({}, ctx),
    connectionStore.listConnections(ctx),
  ]);
  const labels = new Map(connections.map(({ id, label }) => [id, label]));
  const data = models.map(({ id, name, provider, connectionId }) => ({
    id, name, provider: labels.get(connectionId) ?? provider, connectionId,
  }));
  return NextResponse.json({
    models: [...new Set(data.map(({ id }) => id))],
    data,
    defaultModel: data[0]?.id ?? '',
    source: data.length ? 'connections' : 'default',
    ...(data.length ? {} : { warning: 'Configure a provider connection in Settings to start chatting.' }),
  });
});
