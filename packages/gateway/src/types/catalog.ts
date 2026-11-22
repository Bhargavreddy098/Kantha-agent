export type ModelTier = 1 | 2 | 3 | 4;

export interface ModelPricing {
  readonly input: number;
  readonly output: number;
  readonly cacheRead?: number;
  readonly cacheWrite5m?: number;
  readonly cacheWrite1h?: number;
}

export interface ModelCapabilities {
  readonly tools?: boolean;
  readonly vision?: boolean;
  readonly streaming?: boolean;
  readonly reasoning?: {
    readonly supported: boolean;
    readonly effort?: string[];
  };
  readonly promptCache?: boolean;
  readonly contextLimit?: number;
  readonly maxOutputTokens?: number;
}

export interface ModelDefinition {
  readonly id: string;
  readonly providerId: string;
  readonly name: string;
  readonly tier: ModelTier;
  readonly capabilities: ModelCapabilities;
  readonly pricing: ModelPricing;
  readonly description?: string;
}

export interface ModelCatalog {
  readonly models: ModelDefinition[];
  readonly updatedAt: number;
}
