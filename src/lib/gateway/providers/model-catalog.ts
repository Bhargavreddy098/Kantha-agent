import type { IConnectionStore, IModelCatalog, ISecretStore } from '../contracts/adapters';
import type { RequestContext } from '../contracts/context';
import type { DiscoverModelsResult, DiscoveredModelSummary } from '../contracts/connection';
import type { GatewayModel, ModelListQuery } from '../contracts/model';
import { createGatewayError, GatewayError } from '../contracts/errors';
import { makeProviderFetch } from './egress';

const capabilities = { chat: true, streaming: true, reasoning: false, tools: false, vision: false };

export class ModelCatalog implements IModelCatalog {
  constructor(private readonly connections: IConnectionStore, private readonly secrets: ISecretStore) {}

  async listModels(query: ModelListQuery, ctx: RequestContext): Promise<GatewayModel[]> {
    const allConnections = await this.connections.listConnections(ctx);
    const eligible = allConnections.filter((connection) =>
      connection.status === 'active' &&
      (!query.connectionId || connection.id === query.connectionId));
    const search = query.search?.toLowerCase();
    const models: GatewayModel[] = eligible.flatMap((connection) => connection.eligibleModels.map((id) => ({
      id,
      connectionId: connection.id,
      name: id,
      provider: connection.providerType,
      capabilities,
      status: 'available',
    })));
    return models.filter((model) =>
      (!query.status || model.status === query.status) &&
      (!query.capability || model.capabilities[query.capability]) &&
      (!search || model.name.toLowerCase().includes(search) || model.provider.includes(search)));
  }

  async getModel(id: string, ctx: RequestContext, connectionId?: string): Promise<GatewayModel | null> {
    const matches = (await this.listModels({ connectionId }, ctx)).filter((model) => model.id === id);
    if (matches.length > 1) {
      throw createGatewayError({
        code: 'invalid_request',
        message: 'Select the provider connection for this model.',
        field: 'connectionId',
      });
    }
    return matches[0] ?? null;
  }

  async discoverModels(connectionId: string, ctx: RequestContext): Promise<DiscoverModelsResult> {
    const connection = await this.connections.getConnection(connectionId, ctx);
    if (!connection || connection.status === 'revoked') {
      throw createGatewayError({ code: 'not_found', message: 'Provider connection was not found.' });
    }
    const secret = connection.secretRef ? await this.secrets.getSecret(connection.secretRef, ctx) : null;
    if (connection.secretRef && !secret) {
      throw createGatewayError({ code: 'conflict', message: 'Provider credentials changed. Refresh the connection and try again.' });
    }
    let models: DiscoveredModelSummary[];
    try {
      const response = await makeProviderFetch(connection.endpoint)(connection.endpoint + '/models', {
        headers: { accept: 'application/json', ...(secret ? { authorization: 'Bearer ' + secret } : {}) },
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
      models = [...ids].sort().map((id) => ({ id, name: id, provider: connection.providerType, capabilities }));
    } catch (error) {
      if (
        error instanceof GatewayError ||
        (typeof error === 'object' &&
          error !== null &&
          ('code' in error || (error as { name?: string }).name === 'GatewayError'))
      ) {
        throw error;
      }
      const timeout = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
      throw createGatewayError({
        code: timeout ? 'upstream_timeout' : 'upstream_failed',
        message: timeout ? 'The provider timed out during discovery.' : 'Could not reach the provider for model discovery.',
      });
    }

    await this.connections.updateConnection(connectionId, {
      eligibleModels: models.map((model) => model.id),
      expectedRevision: connection.revision,
    }, ctx);
    return { connectionId, models, discoveredAt: new Date().toISOString() };
  }
}
