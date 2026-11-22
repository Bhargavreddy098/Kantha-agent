import fs from "node:fs";
import path from "node:path";
import { Effect, type Layer } from "effect";
import { VaultService, validateEndpointUrl } from "@kantha/gateway";
import { gatewaySecrets } from "@kantha/db";

export interface ProviderModel {
  id: string;
  name: string;
  capabilities?: {
    reasoning?: boolean;
    vision?: boolean;
    streaming?: boolean;
  };
}

export interface ProviderConfig {
  id: string;
  name: string;
  type: "openai" | "anthropic" | "openai_compatible" | "ollama";
  baseURL?: string;
  apiKey?: string;
  headers?: Record<string, string>;
  models: ProviderModel[];
  isCustom?: boolean;
  configured?: boolean;
}

export interface SanitizedProviderConfig {
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

export interface StoredProvidersData {
  defaultModel?: string;
  customProviders: ProviderConfig[];
}

export function maskApiKey(key?: string): string {
  if (!key) return "";
  if (key.length <= 8) return "••••••••";
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

export interface ProviderRegistryOptions {
  dataDir: string;
  db?: any;
  gatewayLayer?: Layer.Layer<any>;
}

export class ProviderRegistry {
  private dataDir: string;
  private filePath: string;
  private customProviders: Map<string, ProviderConfig> = new Map();
  private userDefaultModel?: string;
  private db?: any;
  private gatewayLayer?: Layer.Layer<any>;

  constructor(options: ProviderRegistryOptions) {
    this.dataDir = options.dataDir;
    this.filePath = path.join(this.dataDir, "providers.json");
    this.db = options.db;
    this.gatewayLayer = options.gatewayLayer;
    this.load();
  }

  public setGatewayLayer(layer: Layer.Layer<any>): void {
    this.gatewayLayer = layer;
  }

  public setDb(db: any): void {
    this.db = db;
  }

  public async storeSecret(providerId: string, apiKey: string): Promise<void> {
    if (!this.gatewayLayer) return;
    const program = Effect.gen(function* () {
      const vault = yield* VaultService;
      yield* vault.storeSecret(providerId, apiKey);
    });
    await Effect.runPromise(program.pipe(Effect.provide(this.gatewayLayer)));
  }

  public async getDecryptedKey(providerId: string): Promise<string | null> {
    if (!this.gatewayLayer) return null;
    const program = Effect.gen(function* () {
      const vault = yield* VaultService;
      return yield* vault.getDecryptedKey(providerId);
    });
    return await Effect.runPromise(program.pipe(Effect.provide(this.gatewayLayer))).catch(() => null);
  }

  public async deleteSecret(providerId: string): Promise<void> {
    if (!this.gatewayLayer) return;
    const program = Effect.gen(function* () {
      const vault = yield* VaultService;
      yield* vault.deleteSecret(providerId);
    });
    await Effect.runPromise(program.pipe(Effect.provide(this.gatewayLayer))).catch(() => {});
  }

  public async listSecretIds(): Promise<Set<string>> {
    const set = new Set<string>();
    if (this.db) {
      try {
        const rows = await this.db.select({ id: gatewaySecrets.id }).from(gatewaySecrets);
        for (const r of rows) set.add(r.id);
      } catch {}
    }
    return set;
  }

  public async migrateLegacyKeys(): Promise<void> {
    if (!fs.existsSync(this.filePath)) return;
    try {
      const raw = fs.readFileSync(this.filePath, "utf-8");
      const data: StoredProvidersData = JSON.parse(raw);
      if (!Array.isArray(data.customProviders)) return;

      let migratedCount = 0;
      for (const p of data.customProviders) {
        if (p.apiKey && typeof p.apiKey === "string" && p.apiKey.trim()) {
          await this.storeSecret(p.id, p.apiKey.trim());
          delete p.apiKey;
          migratedCount++;
        }
      }

      if (migratedCount > 0) {
        const tmpPath = `${this.filePath}.tmp`;
        fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf-8");
        fs.renameSync(tmpPath, this.filePath);
        this.load();
      }
    } catch (err) {
      console.error("Failed to migrate legacy provider keys:", err);
    }
  }

  private load(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, "utf-8");
        const data: StoredProvidersData = JSON.parse(raw);
        if (data.defaultModel) {
          this.userDefaultModel = data.defaultModel;
        }
        if (Array.isArray(data.customProviders)) {
          this.customProviders.clear();
          for (const p of data.customProviders) {
            this.customProviders.set(p.id, { ...p, isCustom: true, configured: true });
          }
        }
      }
    } catch {
      // Ignore read errors or uninitialized file
    }
  }

  private save(): void {
    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
      const data: StoredProvidersData = {
        defaultModel: this.userDefaultModel,
        customProviders: Array.from(this.customProviders.values()).map((p) => {
          const clone = { ...p };
          delete clone.apiKey;
          return clone;
        }),
      };
      const tmpPath = `${this.filePath}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf-8");
      fs.renameSync(tmpPath, this.filePath);
    } catch {
      // Ignore write errors
    }
  }

  public getBuiltInProviders(): ProviderConfig[] {
    const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
    const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
    const hasGroq = Boolean(process.env.GROQ_API_KEY);
    const hasDeepSeek = Boolean(process.env.DEEPSEEK_API_KEY);
    const hasOpenRouter = Boolean(process.env.OPENROUTER_API_KEY);

    const openAiBaseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
    const anthropicBaseUrl = (process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com/v1").replace(/\/+$/, "");
    const ollamaBaseUrl = (process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434/v1").replace(/\/+$/, "");
    const groqBaseUrl = (process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/+$/, "");
    const deepSeekBaseUrl = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1").replace(/\/+$/, "");
    const openRouterBaseUrl = (process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/+$/, "");

    return [
      {
        id: "openai",
        name: "OpenAI",
        type: "openai",
        baseURL: openAiBaseUrl,
        apiKey: process.env.OPENAI_API_KEY,
        configured: hasOpenAI,
        models: [
          { id: "gpt-4o", name: "GPT-4o", capabilities: { vision: true, streaming: true } },
          { id: "gpt-4o-mini", name: "GPT-4o Mini", capabilities: { vision: true, streaming: true } },
          { id: "o3-mini", name: "o3-mini (Reasoning)", capabilities: { reasoning: true, streaming: true } },
        ],
      },
      {
        id: "anthropic",
        name: "Anthropic Claude",
        type: "anthropic",
        baseURL: anthropicBaseUrl,
        apiKey: process.env.ANTHROPIC_API_KEY,
        configured: hasAnthropic,
        models: [
          {
            id: "claude-3-7-sonnet",
            name: "Claude 3.7 Sonnet (Thinking)",
            capabilities: { reasoning: true, vision: true, streaming: true },
          },
          {
            id: "claude-3-5-sonnet",
            name: "Claude 3.5 Sonnet",
            capabilities: { vision: true, streaming: true },
          },
        ],
      },
      {
        id: "ollama",
        name: "Ollama (Local)",
        type: "ollama",
        baseURL: ollamaBaseUrl,
        apiKey: process.env.OLLAMA_API_KEY || "ollama",
        configured: true,
        models: [
          { id: "llama3.2", name: "Llama 3.2", capabilities: { streaming: true } },
          { id: "deepseek-r1", name: "DeepSeek R1 (Reasoning)", capabilities: { reasoning: true, streaming: true } },
          { id: "qwen2.5-coder", name: "Qwen 2.5 Coder", capabilities: { streaming: true } },
        ],
      },
      {
        id: "groq",
        name: "Groq Fast Inference",
        type: "openai_compatible",
        baseURL: groqBaseUrl,
        apiKey: process.env.GROQ_API_KEY,
        configured: hasGroq,
        models: [
          { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B", capabilities: { streaming: true } },
          { id: "deepseek-r1-distill-llama-70b", name: "DeepSeek R1 Distill 70B", capabilities: { reasoning: true, streaming: true } },
        ],
      },
      {
        id: "deepseek",
        name: "DeepSeek",
        type: "openai_compatible",
        baseURL: deepSeekBaseUrl,
        apiKey: process.env.DEEPSEEK_API_KEY,
        configured: hasDeepSeek,
        models: [
          { id: "deepseek-chat", name: "DeepSeek V3", capabilities: { streaming: true } },
          { id: "deepseek-reasoner", name: "DeepSeek R1 (Reasoning)", capabilities: { reasoning: true, streaming: true } },
        ],
      },
      {
        id: "openrouter",
        name: "OpenRouter",
        type: "openai_compatible",
        baseURL: openRouterBaseUrl,
        apiKey: process.env.OPENROUTER_API_KEY,
        configured: hasOpenRouter,
        models: [
          { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet (OpenRouter)", capabilities: { vision: true, streaming: true } },
          { id: "deepseek/deepseek-r1", name: "DeepSeek R1 (OpenRouter)", capabilities: { reasoning: true, streaming: true } },
        ],
      },
    ];
  }

  public getAll(): ProviderConfig[] {
    const builtIns = this.getBuiltInProviders();
    const customs = Array.from(this.customProviders.values());
    return [...builtIns, ...customs];
  }

  public getDefaultModel(): string {
    if (this.userDefaultModel) {
      return this.userDefaultModel;
    }
    const builtIns = this.getBuiltInProviders();
    if (builtIns.find((p) => p.id === "anthropic")?.configured) {
      return "anthropic:claude-3-7-sonnet";
    }
    if (builtIns.find((p) => p.id === "openai")?.configured) {
      return "openai:gpt-4o";
    }
    return "ollama:llama3.2";
  }

  public setDefaultModel(modelId: string): void {
    this.userDefaultModel = modelId;
    this.save();
  }

  public getSanitized(): { defaultModel: string; providers: SanitizedProviderConfig[] } {
    const all = this.getAll();
    const providers: SanitizedProviderConfig[] = all.map((p) => {
      const hasApiKey = Boolean((p.apiKey && p.apiKey.trim().length > 0) || p.configured);
      const masked = hasApiKey ? (p.apiKey ? maskApiKey(p.apiKey) : "••••••••") : undefined;
      const sanitizedHeaders: Record<string, string> = {};
      if (p.headers) {
        for (const [k, v] of Object.entries(p.headers)) {
          if (k.toLowerCase().includes("auth") || k.toLowerCase().includes("key") || k.toLowerCase().includes("secret")) {
            sanitizedHeaders[k] = "••••••••";
          } else {
            sanitizedHeaders[k] = v;
          }
        }
      }

      return {
        id: p.id,
        name: p.name,
        type: p.type,
        baseURL: p.baseURL,
        hasApiKey,
        maskedApiKey: masked,
        headers: sanitizedHeaders,
        models: p.models,
        isCustom: p.isCustom,
        configured: Boolean(p.configured || hasApiKey || p.type === "ollama"),
      };
    });

    return {
      defaultModel: this.getDefaultModel(),
      providers,
    };
  }

  public async getSanitizedAsync(): Promise<{ defaultModel: string; providers: SanitizedProviderConfig[] }> {
    const secretIds = await this.listSecretIds();
    const all = this.getAll();
    const providers: SanitizedProviderConfig[] = all.map((p) => {
      const hasApiKey = secretIds.has(p.id) || Boolean(p.apiKey && p.apiKey.trim().length > 0);
      const masked = hasApiKey ? (p.apiKey ? maskApiKey(p.apiKey) : "••••••••") : undefined;
      const sanitizedHeaders: Record<string, string> = {};
      if (p.headers) {
        for (const [k, v] of Object.entries(p.headers)) {
          if (k.toLowerCase().includes("auth") || k.toLowerCase().includes("key") || k.toLowerCase().includes("secret")) {
            sanitizedHeaders[k] = "••••••••";
          } else {
            sanitizedHeaders[k] = v;
          }
        }
      }

      return {
        id: p.id,
        name: p.name,
        type: p.type,
        baseURL: p.baseURL,
        hasApiKey,
        maskedApiKey: masked,
        headers: sanitizedHeaders,
        models: p.models,
        isCustom: p.isCustom,
        configured: Boolean(p.configured || hasApiKey || p.type === "ollama"),
      };
    });

    return {
      defaultModel: this.getDefaultModel(),
      providers,
    };
  }

  public getProviderForModel(
    requestedModel: string,
    explicitProviderId?: string
  ): { provider: ProviderConfig; modelId: string } | null {
    const all = this.getAll();
    const trimmedModel = requestedModel.trim();

    // 1. Explicit provider ID takes precedence
    if (explicitProviderId) {
      const match = all.find((p) => p.id === explicitProviderId);
      if (match) {
        // Strip provider prefix if caller passed "providerId:modelId"
        const cleanModelId = trimmedModel.startsWith(`${explicitProviderId}:`)
          ? trimmedModel.slice(explicitProviderId.length + 1)
          : trimmedModel;
        return { provider: match, modelId: cleanModelId };
      }
      return null;
    }

    // 2. Check if requestedModel starts with a known provider ID prefix
    for (const p of all) {
      if (trimmedModel.startsWith(`${p.id}:`)) {
        return {
          provider: p,
          modelId: trimmedModel.slice(p.id.length + 1),
        };
      }
    }

    // 3. Search all providers for an exact match on model ID (supports colon models like "hy4-flash:free")
    const matchingProviders = all.filter((p) =>
      p.models.some((m) => m.id === trimmedModel)
    );

    if (matchingProviders.length === 1) {
      return { provider: matchingProviders[0], modelId: trimmedModel };
    }

    if (matchingProviders.length > 1) {
      throw new Error(
        `Ambiguous model '${trimmedModel}' exists in multiple providers (${matchingProviders
          .map((p) => p.name)
          .join(", ")}). Please specify the provider explicitly.`
      );
    }

    // 4. Recognized Ollama local model shortcuts
    if (["llama3.2", "deepseek-r1", "qwen2.5-coder"].includes(trimmedModel)) {
      const ollama = all.find((p) => p.id === "ollama");
      if (ollama) return { provider: ollama, modelId: trimmedModel };
    }

    // 5. Fail-closed: Never silently fall back to OpenAI with dummy credentials
    return null;
  }

  public async upsertCustom(providerInput: Partial<ProviderConfig> & { name: string; type: ProviderConfig["type"] }): Promise<ProviderConfig> {
    const id = providerInput.id || `custom_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const existing = this.customProviders.get(id);

    const newApiKey = typeof providerInput.apiKey === "string" ? providerInput.apiKey.trim() : "";
    if (newApiKey) {
      await this.storeSecret(id, newApiKey);
    }

    let hasKey = Boolean(newApiKey);
    if (!hasKey) {
      const existingSecret = await this.getDecryptedKey(id);
      hasKey = Boolean(existingSecret);
    }

    const rawModels: ProviderModel[] = Array.isArray(providerInput.models) && providerInput.models.length > 0
      ? providerInput.models
      : existing?.models || [{ id: "default-model", name: "Default Model" }];

    // Deduplicate models by id, preserving existing capabilities if omitted
    const uniqueModels = new Map<string, ProviderModel>();
    for (const m of rawModels) {
      if (m && typeof m.id === "string" && m.id.trim()) {
        const modelId = m.id.trim();
        if (!uniqueModels.has(modelId)) {
          uniqueModels.set(modelId, {
            id: modelId,
            name: (m.name || modelId).trim(),
            capabilities: m.capabilities || { streaming: true },
          });
        }
      }
    }
    const models = Array.from(uniqueModels.values());

    const updated: ProviderConfig = {
      id,
      name: providerInput.name.trim(),
      type: providerInput.type,
      baseURL: (providerInput.baseURL || "").trim().replace(/\/+$/, ""),
      headers: providerInput.headers || existing?.headers || {},
      models,
      isCustom: true,
      configured: Boolean(hasKey || providerInput.type === "ollama"),
    };

    this.customProviders.set(id, updated);
    this.save();
    return updated;
  }

  public async deleteCustom(id: string): Promise<boolean> {
    if (this.customProviders.has(id)) {
      this.customProviders.delete(id);
      this.save();
      await this.deleteSecret(id);
      return true;
    }
    return false;
  }

  public async testConnection(config: {
    id?: string;
    baseURL?: string;
    apiKey?: string;
    type: string;
    headers?: Record<string, string>;
  }): Promise<{ success: boolean; latencyMs: number; error?: string; status?: number }> {
    const start = Date.now();
    if (!config.apiKey && config.id) {
      config.apiKey = (await this.getDecryptedKey(config.id)) || undefined;
    }

    const url = (config.baseURL || "https://api.openai.com/v1").replace(/\/+$/, "");

    try {
      await validateEndpointUrl(url, { isLocal: config.type === "ollama" });
    } catch (err: any) {
      return {
        success: false,
        latencyMs: 0,
        error: err.message || "SSRF validation rejected URL",
      };
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(config.headers || {}),
    };
    if (config.apiKey) {
      if (config.type === "anthropic") {
        headers["x-api-key"] = config.apiKey;
        headers["anthropic-version"] = "2023-06-01";
      } else {
        headers["Authorization"] = `Bearer ${config.apiKey}`;
      }
    }

    try {
      const testUrl = config.type === "anthropic" ? `${url}/messages` : `${url}/models`;
      const response = await fetch(testUrl, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(6000),
      });

      const latencyMs = Date.now() - start;
      if (response.ok) {
        return { success: true, latencyMs, status: response.status };
      }

      if (response.status === 401) {
        return { success: false, latencyMs, status: 401, error: "Invalid API Key or unauthorized (HTTP 401)" };
      }

      if (response.status === 403) {
        return { success: false, latencyMs, status: 403, error: "Forbidden: API key does not have access (HTTP 403)" };
      }

      if (response.status === 400 || response.status === 404 || response.status === 405) {
        // Some OpenAI-compatible servers return 400/404/405 on GET /models or /messages if unimplemented,
        // but it proves host connectivity and responsive server
        return { success: true, latencyMs, status: response.status };
      }

      const errorText = await response.text().catch(() => "");
      return {
        success: false,
        latencyMs,
        status: response.status,
        error: `Provider returned status ${response.status}: ${errorText.slice(0, 150)}`,
      };
    } catch (err: any) {
      return {
        success: false,
        latencyMs: Date.now() - start,
        error: err.message || "Connection timed out or host unreachable",
      };
    }
  }

  public async discoverModels(config: {
    id?: string;
    baseURL?: string;
    apiKey?: string;
    headers?: Record<string, string>;
  }): Promise<Array<{ id: string; name: string }>> {
    if (!config.apiKey && config.id) {
      config.apiKey = (await this.getDecryptedKey(config.id)) || undefined;
    }
    const url = (config.baseURL || "https://api.openai.com/v1").replace(/\/+$/, "");

    try {
      await validateEndpointUrl(url, { isLocal: false });
    } catch (err: any) {
      throw new Error(`SSRF error: ${err.message}`);
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(config.headers || {}),
    };
    if (config.apiKey) {
      headers["Authorization"] = `Bearer ${config.apiKey}`;
    }

    try {
      const response = await fetch(`${url}/models`, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(
          errorText
            ? `Upstream error (${response.status}): ${errorText.slice(0, 150)}`
            : `Upstream endpoint returned HTTP ${response.status}`
        );
      }

      const data = await response.json();
      let rawList: any[] = [];
      if (Array.isArray(data?.data)) {
        rawList = data.data;
      } else if (Array.isArray(data?.models)) {
        rawList = data.models;
      } else if (Array.isArray(data)) {
        rawList = data;
      }

      const seen = new Set<string>();
      const result: Array<{ id: string; name: string }> = [];
      for (const item of rawList) {
        if (item && (typeof item.id === "string" || typeof item.name === "string")) {
          const id = (item.id || item.name).trim();
          if (id && !seen.has(id)) {
            seen.add(id);
            result.push({
              id,
              name: (item.name || id).trim(),
            });
          }
        }
      }
      return result;
    } catch (err: any) {
      throw new Error(err.message || "Failed to discover models from endpoint");
    }
  }
}
