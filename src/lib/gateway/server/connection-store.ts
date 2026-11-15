import { randomUUID } from 'node:crypto';
import type { IConnectionStore } from '../contracts/adapters';
import type { GatewayConnection, CreateConnectionInput, UpdateConnectionInput } from '../contracts/connection';
import type { RequestContext } from '../contracts/context';
import { GatewayError } from '../contracts/errors';
import { GatewaySecretStore } from './secret-store';
import { GatewayDatabase } from './storage/database';

export class GatewayConnectionStore implements IConnectionStore {
  constructor(private readonly db: GatewayDatabase, private readonly secrets: GatewaySecretStore) {}

  async listConnections(ctx: RequestContext): Promise<GatewayConnection[]> {
    return this.db.list('connections', ctx.workspaceId);
  }

  async getConnection(id: string, ctx: RequestContext): Promise<GatewayConnection | null> {
    return this.db.get('connections', ctx.workspaceId, id);
  }

  async createConnection(input: CreateConnectionInput, ctx: RequestContext): Promise<GatewayConnection> {
    return this.db.write(() => {
      const id = `conn_${randomUUID()}`;
      const secretRef = input.apiKey ? `sec_${randomUUID()}` : undefined;
      if (input.apiKey && secretRef) this.secrets.writeSecret(secretRef, input.apiKey, ctx);

      const now = new Date().toISOString();
      const connection: GatewayConnection = {
        id,
        workspaceId: ctx.workspaceId,
        label: input.label,
        endpoint: input.endpoint,
        providerType: input.providerType,
        status: 'active',
        secretRef,
        eligibleModels: input.eligibleModels ?? [],
        createdAt: now,
        updatedAt: now,
        revision: randomUUID(),
      };
      this.db.put('connections', ctx.workspaceId, id, connection);
      return connection;
    });
  }

  async updateConnection(id: string, input: UpdateConnectionInput, ctx: RequestContext): Promise<GatewayConnection> {
    return this.db.write(() => {
      const existing = this.db.get<GatewayConnection>('connections', ctx.workspaceId, id);
      if (!existing) throw new GatewayError({ code: 'not_found', message: 'Connection not found', requestId: ctx.requestId, resource: id });
      if (input.expectedRevision !== undefined && input.expectedRevision !== existing.revision) {
        throw new GatewayError({ code: 'conflict', message: 'Connection changed. Refresh and try again.', requestId: ctx.requestId, resource: id });
      }

      const endpointChanged =
        (input.endpoint !== undefined && input.endpoint !== existing.endpoint) ||
        (input.providerType !== undefined && input.providerType !== existing.providerType);
      const revoked = input.status === 'revoked';
      const credentialsChanged = input.apiKey !== undefined;
      let secretRef = existing.secretRef;
      if (input.apiKey && !revoked) {
        if (secretRef) this.secrets.removeSecret(secretRef, ctx);
        secretRef = `sec_${randomUUID()}`;
        this.secrets.writeSecret(secretRef, input.apiKey, ctx);
      } else if (secretRef && (revoked || endpointChanged || input.apiKey === '')) {
        this.secrets.removeSecret(secretRef, ctx);
        secretRef = undefined;
      }

      const updated: GatewayConnection = {
        ...existing,
        label: input.label ?? existing.label,
        endpoint: input.endpoint ?? existing.endpoint,
        providerType: input.providerType ?? existing.providerType,
        status: input.status ?? existing.status,
        eligibleModels: revoked || endpointChanged || credentialsChanged ? [] : (input.eligibleModels ?? existing.eligibleModels),
        lastTestedAt: endpointChanged || credentialsChanged ? undefined : existing.lastTestedAt,
        lastError: endpointChanged || credentialsChanged ? undefined : existing.lastError,
        secretRef,
        updatedAt: new Date().toISOString(),
        revision: randomUUID(),
      };
      this.db.put('connections', ctx.workspaceId, id, updated);
      return updated;
    });
  }

  async recordConnectionTest(
    id: string,
    expectedRevision: string | undefined,
    outcome: { testedAt: string; success: boolean },
    ctx: RequestContext,
  ): Promise<GatewayConnection | null> {
    return this.db.write(() => {
      const current = this.db.get<GatewayConnection>('connections', ctx.workspaceId, id);
      if (!current || current.revision !== expectedRevision) return null;
      if (current.lastTestedAt && current.lastTestedAt > outcome.testedAt) return current;
      current.lastTestedAt = outcome.testedAt;
      current.lastError = outcome.success ? undefined : 'Provider connection test failed';
      this.db.put('connections', ctx.workspaceId, id, current, Date.parse(current.updatedAt));
      return current;
    });
  }

  async deleteConnection(id: string, ctx: RequestContext): Promise<boolean> {
    return this.db.write(() => {
      const existing = this.db.get<GatewayConnection>('connections', ctx.workspaceId, id);
      if (existing?.secretRef) this.secrets.removeSecret(existing.secretRef, ctx);
      return this.db.delete('connections', ctx.workspaceId, id);
    });
  }
}
