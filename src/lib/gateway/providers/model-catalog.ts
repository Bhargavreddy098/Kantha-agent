import type { IConnectionStore, IModelCatalog, ISecretStore } from '../contracts/adapters';
import type { RequestContext } from '../contracts/context';
import type { DiscoverModelsResult } from '../contracts/connection';
import type { GatewayModel, ModelListQuery } from '../contracts/model';
import { createGatewayError } from '../contracts/errors';
import { fetchProviderModelIds } from './provider-model-list';

const capabilities = { chat: true, streaming: true, reasoning: false, tools: false, vision: false };

export class ModelCatalog implements IModelCatalog {
  constructor(private readonly connections: IConnectionStore, private readonly secrets: ISecretStore) {}

  async listModels(query: ModelListQuery, ctx: RequestContext): Promise<GatewayModel[]> {
    const specific = query.connectionId ? await this.connections.getConnection(query.connectionId, ctx) : undefined;
    const connections = query.connectionId ? (specific ? [specific] : []) : await this.connections.listConnections(ctx);
    const eligible = connections.filter((connection) => connection.status === 'active');
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

  async resolveChatSelection(input: { connectionId?: string; modelId?: string }, ctx: RequestContext) {
    // Explicit selections must be replayable even if the provider was changed after submission.
    let { connectionId, modelId } = input;
    if (!connectionId || !modelId) {
      if (modelId && !connectionId) {
        connectionId = (await this.getModel(modelId, ctx))?.connectionId;
      }
      const connections = await this.connections.listConnections(ctx);
      const selected = connections.find((connection) =>
        connection.status === 'active' &&
        (!connectionId || connection.id === connectionId) &&
        (modelId ? connection.eligibleModels.includes(modelId) : connection.eligibleModels.length > 0)
      );
      connectionId = selected?.id;
      modelId = modelId ?? selected?.eligibleModels[0];
    }
    if (!connectionId || !modelId) {
      throw createGatewayError({
        code: 'invalid_request', message: 'Select an eligible model from an active provider connection.',
        field: 'model', requestId: ctx.requestId,
      });
    }
    return { connectionId, modelId };
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
    const ids = await fetchProviderModelIds(connection, secret);
    const models = ids.map((id) => ({ id, name: id, provider: connection.providerType, capabilities }));

    await this.connections.updateConnection(connectionId, {
      eligibleModels: models.map((model) => model.id),
      expectedRevision: connection.revision,
    }, ctx);
    return { connectionId, models, discoveredAt: new Date().toISOString() };
  }
}
