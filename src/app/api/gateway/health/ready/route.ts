import { connection, NextResponse } from 'next/server';
import { gatewayLifecycle } from '@/lib/gateway/server/registry';

export async function GET() {
  // Readiness is sampled from the running instance, including storage and access configuration.
  await connection();
  gatewayLifecycle.refresh();
  const { ready, status, retryAfterSeconds } = gatewayLifecycle.getReadiness();
  return NextResponse.json({ ready, status }, {
    status: ready ? 200 : 503,
    headers: {
      'cache-control': 'no-store',
      ...(retryAfterSeconds ? { 'retry-after': String(retryAfterSeconds) } : {}),
    },
  });
}
