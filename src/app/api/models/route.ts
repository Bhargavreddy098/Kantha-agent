import { NextResponse } from 'next/server';
import { readGatewayJson, withGatewayIngress } from '@/lib/gateway/server/ingress';
import { getGatewayRegistry } from '@/lib/gateway/server/registry';
import { createGatewayError } from '@/lib/gateway/contracts/errors';
import type { RequestContext } from '@/lib/gateway/contracts/context';

async function listModels(ctx: RequestContext, connectionId: string | undefined) {
  const available = await getGatewayRegistry().modelCatalog.listModels({ connectionId }, ctx);
  const data = available.map(({ id, name, provider, connectionId, capabilities }) => ({
    id, name, provider, connectionId, capabilities,
  }));
  return NextResponse.json({ models: [...new Set(data.map((model) => model.id))], data, total: data.length });
}

function validateFilter(raw: unknown): string | undefined {
  if (raw === undefined || raw === null) return;
  if (typeof raw !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(raw)) {
    throw createGatewayError({ code: 'invalid_request', field: 'connectionId', message: 'Invalid connection selection.' });
  }
  return raw;
}

function rejectProviderOverrides() {
  throw createGatewayError({ code: 'invalid_request', message: 'Use a saved provider connection.' });
}

export const GET = withGatewayIngress(async (req, ctx) => {
  const query = req.nextUrl.searchParams;
  if (query.has('baseUrl') || query.has('apiKey')) rejectProviderOverrides();
  return listModels(ctx, validateFilter(query.get('connectionId')));
});

export const POST = withGatewayIngress(async (req, ctx) => {
  const body = await readGatewayJson(req, 4096);
  if (body !== null && (typeof body !== 'object' || Array.isArray(body))) {
    throw createGatewayError({ code: 'invalid_request', message: 'Expected a model query object.' });
  }
  const input = body as { apiKey?: unknown; baseUrl?: unknown; connectionId?: unknown } | null;
  if (input && ('baseUrl' in input || 'apiKey' in input)) rejectProviderOverrides();
  return listModels(ctx, validateFilter(input?.connectionId));
});
