/**
 * Gateway Model Catalog Contracts
 * Route endpoints:
 *   GET /api/models
 *   GET /api/v1/models
 *   GET /api/gateway/models
 */

export interface ModelCapabilities {
  chat: boolean;
  reasoning: boolean;
  tools: boolean;
  vision: boolean;
  streaming: boolean;
}

export interface ModelPricing {
  promptPerMillion?: number;
  completionPerMillion?: number;
  currency?: string;
}

export type ModelLifecycleStatus = 'available' | 'disabled' | 'deprecated';

export interface GatewayModel {
  id: string;
  connectionId: string;
  name: string;
  provider: string;
  contextWindow?: number;
  maxTokens?: number;
  capabilities: ModelCapabilities;
  pricing?: ModelPricing;
  isDefault?: boolean;
  status: ModelLifecycleStatus;
  description?: string;
}

export interface ModelListQuery {
  connectionId?: string;
  capability?: keyof ModelCapabilities;
  status?: ModelLifecycleStatus;
  search?: string;
}

export interface ModelListResponse {
  models: GatewayModel[];
  total: number;
  defaultModelId?: string;
}
