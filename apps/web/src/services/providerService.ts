export interface ProviderModel {
  id: string;
  name: string;
  capabilities?: {
    reasoning?: boolean;
    vision?: boolean;
    streaming?: boolean;
  };
}

export interface SanitizedProviderItem {
  id: string;
  name: string;
  type: "openai" | "anthropic" | "openai_compatible" | "ollama";
  baseURL?: string;
  hasApiKey: boolean;
  maskedApiKey?: string;
  headers?: Record<string, string>;
  models: ProviderModel[];
  isCustom?: boolean;
  configured: boolean;
}

export interface ProvidersDataResponse {
  defaultModel: string;
  providers: SanitizedProviderItem[];
}

export interface TestConnectionResponse {
  success: boolean;
  latencyMs: number;
  status?: number;
  error?: string;
}

export interface DiscoverModelsResponse {
  models: Array<{ id: string; name: string }>;
  error?: string;
}

export const providerService = {
  async getProviders(): Promise<ProvidersDataResponse> {
    const res = await fetch("/api/providers", {
      credentials: "include",
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch providers: status ${res.status}`);
    }
    return res.json();
  },

  async setDefaultModel(modelId: string): Promise<{ success: boolean; defaultModel: string }> {
    const res = await fetch("/api/providers/default", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelId }),
    });
    if (!res.ok) {
      throw new Error("Failed to set default model");
    }
    return res.json();
  },

  async upsertCustomProvider(provider: {
    id?: string;
    name: string;
    type: string;
    baseURL?: string;
    apiKey?: string;
    headers?: Record<string, string>;
    models: ProviderModel[];
  }): Promise<ProvidersDataResponse> {
    const res = await fetch("/api/providers", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(provider),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to save custom provider");
    }
    return res.json();
  },

  async deleteCustomProvider(providerId: string): Promise<ProvidersDataResponse> {
    const res = await fetch(`/api/providers/${encodeURIComponent(providerId)}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      throw new Error("Failed to delete custom provider");
    }
    return res.json();
  },

  async testConnection(config: {
    baseURL?: string;
    apiKey?: string;
    type: string;
    headers?: Record<string, string>;
  }): Promise<TestConnectionResponse> {
    const res = await fetch("/api/providers/test", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    return res.json();
  },

  async discoverModels(config: {
    baseURL?: string;
    apiKey?: string;
    headers?: Record<string, string>;
  }): Promise<DiscoverModelsResponse> {
    const res = await fetch("/api/providers/discover", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    return res.json();
  },
};
