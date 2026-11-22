import { Layer, Effect } from "effect";
import { VaultStore } from "./vault";
import { MasterKeyProvider } from "./master-key";
import { ProviderStore } from "./providers";
import { LedgerStore } from "./ledger";
import { CatalogCacheStore } from "./cache";
import type { ProviderConfig } from "../types/provider";
import type { LedgerEntry, SessionUsageSummary } from "../types/usage";

export const InMemoryVaultLayer = Layer.sync(VaultStore, () => {
  const store = new Map<string, string>();
  return {
    getSecret: (key: string) => Effect.succeed(store.get(key) ?? null),
    setSecret: (key: string, value: string) =>
      Effect.sync(() => {
        store.set(key, value);
      }),
    deleteSecret: (key: string) =>
      Effect.sync(() => {
        store.delete(key);
      }),
    listKeys: () => Effect.succeed(Array.from(store.keys())),
  };
});

export const InMemoryMasterKeyLayer = Layer.sync(MasterKeyProvider, () => {
  const testKey = Buffer.alloc(32, 0x42);
  return {
    getMasterKey: () => Effect.succeed(testKey),
  };
});

export const InMemoryProviderLayer = Layer.sync(ProviderStore, () => {
  const providers = new Map<string, ProviderConfig>();
  return {
    getProvider: (id: string) => Effect.succeed(providers.get(id) ?? null),
    listProviders: () => Effect.succeed(Array.from(providers.values())),
    saveProvider: (p: ProviderConfig) =>
      Effect.sync(() => {
        providers.set(p.id, p);
      }),
    deleteProvider: (id: string) =>
      Effect.sync(() => {
        providers.delete(id);
      }),
  };
});

export const InMemoryLedgerLayer = Layer.sync(LedgerStore, () => {
  const entries: LedgerEntry[] = [];
  return {
    checkBudget: (_sessionId: string) => Effect.succeed({ allowed: true }),
    recordTurnUsage: (entry: LedgerEntry) =>
      Effect.sync(() => {
        entries.push(entry);
      }),
    getSessionUsage: (sessionId: string) =>
      Effect.sync(() => {
        const sessionEntries = entries.filter((e) => e.sessionId === sessionId);
        let totalInputTokens = 0;
        let totalOutputTokens = 0;
        let totalReasoningTokens = 0;
        let totalCacheReadTokens = 0;
        let totalCacheWriteTokens = 0;
        let totalCostUsd = 0;

        for (const e of sessionEntries) {
          totalInputTokens += e.inputTokens;
          totalOutputTokens += e.outputTokens;
          totalReasoningTokens += e.reasoningTokens;
          totalCacheReadTokens += e.cacheReadTokens;
          totalCacheWriteTokens += e.cacheWrite5mTokens + e.cacheWrite1hTokens;
          totalCostUsd += e.costUsd;
        }

        const totalTokens =
          totalInputTokens +
          totalOutputTokens +
          totalReasoningTokens +
          totalCacheReadTokens +
          totalCacheWriteTokens;

        const summary: SessionUsageSummary = {
          sessionId,
          totalInputTokens,
          totalOutputTokens,
          totalReasoningTokens,
          totalCacheReadTokens,
          totalCacheWriteTokens,
          totalTokens,
          totalCostUsd,
          turnCount: sessionEntries.length,
        };
        return summary;
      }),
  };
});

export const InMemoryCatalogCacheLayer = Layer.sync(CatalogCacheStore, () => {
  let cached: string | null = null;
  return {
    getCachedCatalog: () => Effect.succeed(cached),
    setCachedCatalog: (raw: string) =>
      Effect.sync(() => {
        cached = raw;
      }),
  };
});

export const InMemoryPortsLayer = Layer.mergeAll(
  InMemoryVaultLayer,
  InMemoryMasterKeyLayer,
  InMemoryProviderLayer,
  InMemoryLedgerLayer,
  InMemoryCatalogCacheLayer
);
