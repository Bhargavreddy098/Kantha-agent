import type { GatewayConnection } from '../contracts/connection';
import { createGatewayError, GatewayError } from '../contracts/errors';
import { makeProviderFetch } from './egress';

// Model inventory is a provider API operation, separate from SDK inference.
export async function fetchProviderModelIds(connection: GatewayConnection, secret: string | null): Promise<string[]> {
  const authHeaders: Record<string, string> = {};
  if (secret) {
    if (connection.providerType === 'anthropic') {
      authHeaders['x-api-key'] = secret;
      authHeaders['anthropic-version'] = '2023-06-01';
    } else {
      authHeaders['authorization'] = `Bearer ${secret}`;
    }
  }
  try {
    const response = await makeProviderFetch(connection.endpoint)(connection.endpoint + '/models', {
      headers: { accept: 'application/json', ...authHeaders },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      const invalid = response.status === 401 || response.status === 403;
      throw createGatewayError({
        code: response.status === 429 ? 'rate_limited' : 'upstream_failed',
        message: invalid ? 'The provider rejected the configured credential.' : 'The provider could not list models.',
      });
    }
    const declaredSize = Number(response.headers.get('content-length'));
    if (declaredSize > 2 * 1024 * 1024) {
      await response.body?.cancel();
      throw createGatewayError({ code: 'upstream_failed', message: 'The provider model response was too large.' });
    }
    const raw = await response.json() as { data?: unknown; models?: unknown } | unknown[];
    const values = Array.isArray(raw) ? raw : raw?.data ?? raw?.models;
    if (!Array.isArray(values)) {
      throw createGatewayError({ code: 'upstream_failed', message: 'The provider returned an invalid model list.' });
    }
    const ids = new Set<string>();
    for (const value of values.slice(0, 5000)) {
      const id = typeof value === 'string' ? value : value?.id ?? value?.name;
      if (typeof id === 'string' && id.trim() && id.length <= 256) ids.add(id);
    }
    return [...ids].sort();
  } catch (error) {
    if (error instanceof GatewayError) throw error;
    const timeout = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    throw createGatewayError({
      code: timeout ? 'upstream_timeout' : 'upstream_failed',
      message: timeout ? 'The provider timed out during discovery.' : 'Could not reach the provider for model discovery.',
    });
  }
}
