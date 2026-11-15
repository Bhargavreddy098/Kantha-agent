/**
 * Gateway Connections & Providers Contracts
 * Route endpoints:
 *   GET /api/gateway/connections
 *   POST /api/gateway/connections
 *   PATCH /api/gateway/connections/:id
 *   DELETE /api/gateway/connections/:id
 *   POST /api/gateway/connections/:id/test
 *   POST /api/gateway/connections/:id/discover
 */

export type ProviderType =
  | 'openai'
  | 'anthropic'
  | 'groq'
  | 'openrouter'
  | 'ollama'
  | 'deepseek'
  | 'together'
  | 'custom';

export type ConnectionStatus = 'active' | 'inactive' | 'testing' | 'error' | 'revoked';

export interface GatewayConnection {
  id: string;
  workspaceId: string;
  label: string;
  endpoint: string;
  providerType: ProviderType;
  status: ConnectionStatus;
  secretRef?: string;
  hasCredential?: boolean;
  revision?: string;
  eligibleModels: string[];
  createdAt: string;
  updatedAt: string;
  lastTestedAt?: string;
  lastError?: string;
}

export interface CreateConnectionInput {
  label: string;
  endpoint: string;
  providerType: ProviderType;
  apiKey?: string;
  eligibleModels?: string[];
}

export interface UpdateConnectionInput {
  label?: string;
  endpoint?: string;
  providerType?: ProviderType;
  apiKey?: string;
  status?: ConnectionStatus;
  eligibleModels?: string[];
  expectedRevision?: string;
}

export interface TestConnectionInput {
  endpoint?: string;
  apiKey?: string;
  providerType?: ProviderType;
}

export interface TestConnectionResult {
  success: boolean;
  latencyMs: number;
  message: string;
  modelsCount?: number;
  testedAt: string;
}

export interface DiscoveredModelSummary {
  id: string;
  name: string;
  provider: string;
  contextWindow?: number;
  capabilities?: {
    chat: boolean;
    reasoning: boolean;
    tools: boolean;
    vision: boolean;
    streaming: boolean;
  };
}

export interface DiscoverModelsResult {
  connectionId: string;
  models: DiscoveredModelSummary[];
  discoveredAt: string;
}
