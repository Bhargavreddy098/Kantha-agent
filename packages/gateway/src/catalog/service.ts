import { Context, Effect, Layer } from "effect";
import { CatalogCacheStore, CatalogError } from "../ports/cache";
import type { ModelCatalog, ModelDefinition, ModelPricing, ModelCapabilities } from "../types/catalog";
import { deriveModelTier } from "./tiers";
import bundledSnapshot from "./snapshot.json";

export interface CatalogService {
  readonly getCatalog: () => Effect.Effect<ModelCatalog, CatalogError>;
  readonly syncRemoteCatalog: () => Effect.Effect<ModelCatalog, CatalogError>;
}

export const CatalogService = Context.GenericTag<CatalogService>("@kantha/gateway/CatalogService");

function parseModelsDevCatalog(raw: any): ModelCatalog {
  const models: ModelDefinition[] = [];
  const providersObj = raw?.providers || raw;

  if (typeof providersObj === "object" && providersObj !== null) {
    for (const [providerId, providerData] of Object.entries<any>(providersObj)) {
      if (!providerData?.models || typeof providerData.models !== "object") continue;

      for (const [rawModelId, modelInfo] of Object.entries<any>(providerData.models)) {
        const id = `${providerId}/${rawModelId}`;
        const name = modelInfo.name || rawModelId;
        const inputCost = modelInfo.cost?.input ?? modelInfo.pricing?.input ?? 0;
        const outputCost = modelInfo.cost?.output ?? modelInfo.pricing?.output ?? 0;
        const cacheRead = modelInfo.cost?.cache_read ?? modelInfo.pricing?.cache_read;
        const cacheWrite = modelInfo.cost?.cache_write ?? modelInfo.pricing?.cache_write;

        const pricing: ModelPricing = {
          input: Number(inputCost),
          output: Number(outputCost),
          cacheRead: cacheRead !== undefined ? Number(cacheRead) : undefined,
          cacheWrite5m: cacheWrite !== undefined ? Number(cacheWrite) : undefined,
        };

        const capabilities: ModelCapabilities = {
          tools: modelInfo.tools ?? modelInfo.capabilities?.tools ?? true,
          vision: modelInfo.vision ?? modelInfo.capabilities?.vision ?? false,
          streaming: true,
          reasoning: modelInfo.reasoning
            ? {
                supported: true,
                effort: modelInfo.reasoning_options?.[0]?.values,
              }
            : undefined,
          contextLimit: modelInfo.limit?.context ?? modelInfo.context_length,
          maxOutputTokens: modelInfo.limit?.output ?? modelInfo.max_output_tokens,
        };

        const partialDef: ModelDefinition = {
          id,
          providerId,
          name,
          tier: 4,
          capabilities,
          pricing,
          description: modelInfo.description,
        };

        const tier = deriveModelTier(partialDef);

        models.push({
          ...partialDef,
          tier,
        });
      }
    }
  }

  // Fallback defaults if empty
  if (models.length === 0) {
    models.push(
      {
        id: "anthropic/claude-3-7-sonnet",
        providerId: "anthropic",
        name: "Claude 3.7 Sonnet (Thinking)",
        tier: 1,
        capabilities: { tools: true, reasoning: { supported: true }, contextLimit: 200_000 },
        pricing: { input: 3.0, output: 15.0 },
      },
      {
        id: "openai/gpt-4o",
        providerId: "openai",
        name: "GPT-4o",
        tier: 1,
        capabilities: { tools: true, reasoning: { supported: true }, contextLimit: 128_000 },
        pricing: { input: 2.5, output: 10.0 },
      },
      {
        id: "ollama/llama3.2",
        providerId: "ollama",
        name: "Llama 3.2",
        tier: 4,
        capabilities: { tools: true },
        pricing: { input: 0, output: 0 },
      }
    );
  }

  return {
    models,
    updatedAt: Date.now(),
  };
}

export const CatalogServiceLive = Layer.effect(
  CatalogService,
  Effect.gen(function* () {
    const cacheStore = yield* CatalogCacheStore;

    const loadCachedOrBundled = Effect.gen(function* () {
      const cached = yield* cacheStore.getCachedCatalog();
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (parsed && Array.isArray(parsed.models)) {
            return parsed as ModelCatalog;
          }
          return parseModelsDevCatalog(parsed);
        } catch {
          // If cached catalog corrupted, fall back to bundled
        }
      }
      return parseModelsDevCatalog(bundledSnapshot);
    });

    return {
      getCatalog: () => loadCachedOrBundled,

      syncRemoteCatalog: () =>
        Effect.gen(function* () {
          try {
            const res = yield* Effect.tryPromise({
              try: () => fetch("https://models.dev/catalog.json", { signal: AbortSignal.timeout(8000) }),
              catch: (err) => new CatalogError(`Failed to fetch models.dev catalog: ${String(err)}`),
            });

            if (!res.ok) {
              return yield* loadCachedOrBundled;
            }

            const rawJson = yield* Effect.tryPromise({
              try: () => res.json(),
              catch: (err) => new CatalogError(`Failed to parse remote catalog JSON: ${String(err)}`),
            });

            const parsed = parseModelsDevCatalog(rawJson);
            yield* cacheStore.setCachedCatalog(JSON.stringify(parsed));
            return parsed;
          } catch {
            return yield* loadCachedOrBundled;
          }
        }),
    };
  })
);
