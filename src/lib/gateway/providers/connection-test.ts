import type { GatewayConnection, TestConnectionResult } from '../contracts/connection';
import { GatewayError } from '../contracts/errors';
import { fetchProviderModelIds } from './provider-model-list';

export async function testConnection(connection: GatewayConnection, secret: string | null): Promise<TestConnectionResult> {
  const startedAt = Date.now();
  const result = (success: boolean, message: string, modelsCount?: number): TestConnectionResult => ({
    success,
    message,
    modelsCount,
    latencyMs: Date.now() - startedAt,
    testedAt: new Date().toISOString(),
  });

  try {
    const models = await fetchProviderModelIds(connection, secret);
    return result(true, 'Connected to the provider.', models.length);
  } catch (error) {
    return result(false, error instanceof GatewayError ? error.message : 'Could not verify the provider connection.');
  }
}
