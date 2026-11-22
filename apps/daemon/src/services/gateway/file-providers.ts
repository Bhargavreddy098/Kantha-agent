import { Layer, Effect } from "effect";
import { ProviderStore, ProviderError, type ProviderConfig } from "@kantha/gateway";
import fs from "node:fs";
import path from "node:path";

export interface FileProviderOptions {
  dataDir?: string;
}

export function createFileProviderLayer(options: FileProviderOptions = {}) {
  const dataDir =
    options.dataDir ||
    process.env.KANTHA_DATA_DIR ||
    path.resolve(process.cwd(), ".kantha-data");
  const filePath = path.join(dataDir, "providers.json");

  const readCustomProviders = (): Map<string, ProviderConfig> => {
    const map = new Map<string, ProviderConfig>();
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, "utf-8");
        const parsed = JSON.parse(raw);
        const list = Array.isArray(parsed.customProviders)
          ? parsed.customProviders
          : Array.isArray(parsed)
          ? parsed
          : [];
        for (const p of list) {
          if (p && p.id) {
            map.set(p.id, p);
          }
        }
      }
    } catch {
      // Ignore read errors
    }
    return map;
  };

  const writeCustomProviders = (map: Map<string, ProviderConfig>): void => {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const data = {
      customProviders: Array.from(map.values()),
    };
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  };

  const getBuiltInFallback = (id: string): ProviderConfig | null => {
    if (id === "anthropic") {
      return {
        id: "anthropic",
        name: "Anthropic",
        type: "anthropic",
        apiKey: process.env.ANTHROPIC_API_KEY,
        models: [{ id: "claude-3-7-sonnet" }, { id: "claude-3-5-sonnet" }],
      };
    }
    if (id === "openai") {
      return {
        id: "openai",
        name: "OpenAI",
        type: "openai",
        apiKey: process.env.OPENAI_API_KEY,
        models: [{ id: "gpt-4o" }, { id: "gpt-4o-mini" }],
      };
    }
    if (id === "ollama") {
      return {
        id: "ollama",
        name: "Ollama",
        type: "ollama",
        isLocal: true,
        baseURL: process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434",
        models: [{ id: "llama3.2" }],
      };
    }
    return null;
  };

  return Layer.sync(ProviderStore, () => ({
    getProvider: (id: string) =>
      Effect.try({
        try: () => {
          const custom = readCustomProviders();
          if (custom.has(id)) {
            return custom.get(id)!;
          }
          return getBuiltInFallback(id);
        },
        catch: (err) => new ProviderError(`Failed to get provider: ${String(err)}`),
      }),

    listProviders: () =>
      Effect.try({
        try: () => {
          const custom = readCustomProviders();
          const builtIns: ProviderConfig[] = [
            getBuiltInFallback("anthropic")!,
            getBuiltInFallback("openai")!,
            getBuiltInFallback("ollama")!,
          ].filter(Boolean);

          const result: ProviderConfig[] = [];
          for (const b of builtIns) {
            if (custom.has(b.id)) {
              result.push(custom.get(b.id)!);
              custom.delete(b.id);
            } else {
              result.push(b);
            }
          }
          result.push(...Array.from(custom.values()));
          return result;
        },
        catch: (err) => new ProviderError(`Failed to list providers: ${String(err)}`),
      }),

    saveProvider: (p: ProviderConfig) =>
      Effect.try({
        try: () => {
          const custom = readCustomProviders();
          custom.set(p.id, p);
          writeCustomProviders(custom);
        },
        catch: (err) => new ProviderError(`Failed to save provider: ${String(err)}`),
      }),

    deleteProvider: (id: string) =>
      Effect.try({
        try: () => {
          const custom = readCustomProviders();
          custom.delete(id);
          writeCustomProviders(custom);
        },
        catch: (err) => new ProviderError(`Failed to delete provider: ${String(err)}`),
      }),
  }));
}
