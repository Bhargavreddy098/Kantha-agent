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

/**
 * Safely parses response JSON with defensive status checks:
 * 1. Returns null on 204 No Content.
 * 2. Reads res.text() first before attempting to parse JSON.
 * 3. If !res.ok, extracts parsed.error or truncates raw text (max 200 chars) and throws.
 * 4. If res.ok but body is empty or non-JSON (e.g. HTML proxy page), throws a clean readable error instead of raw SyntaxError.
 */
export async function safeJson<T = any>(res: Response): Promise<T> {
  if (res.status === 204) {
    return null as unknown as T;
  }

  const rawText = await res.text().catch(() => "");
  const trimmed = rawText.trim();

  let parsed: any = null;
  if (trimmed) {
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      // Non-JSON content (e.g., HTML proxy page or plain text error)
    }
  }

  if (!res.ok) {
    const errorMsg =
      parsed?.error ||
      (trimmed ? trimmed.slice(0, 200) : `Request failed with status ${res.status}`);
    throw new Error(errorMsg);
  }

  if (!trimmed) {
    throw new Error("Unexpected empty response from server");
  }

  if (parsed === null) {
    throw new Error(
      `Unexpected non-JSON response from daemon (${trimmed.slice(0, 100)})`
    );
  }

  return parsed as T;
}

export const providerService = {
  async getProviders(): Promise<ProvidersDataResponse> {
    const res = await fetch("/api/providers", {
      credentials: "include",
    });
    return safeJson<ProvidersDataResponse>(res);
  },

  async setDefaultModel(modelId: string): Promise<{ success: boolean; defaultModel: string }> {
    const res = await fetch("/api/providers/default", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelId }),
    });
    return safeJson<{ success: boolean; defaultModel: string }>(res);
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
    return safeJson<ProvidersDataResponse>(res);
  },

  async deleteCustomProvider(providerId: string): Promise<ProvidersDataResponse> {
    const res = await fetch(`/api/providers/${encodeURIComponent(providerId)}`, {
      method: "DELETE",
      credentials: "include",
    });
    return safeJson<ProvidersDataResponse>(res);
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
    return safeJson<TestConnectionResponse>(res);
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
    return safeJson<DiscoverModelsResponse>(res);
  },
};
