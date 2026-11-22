import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Effect } from "effect";
import { VaultStore } from "../vault";
import { ProviderStore } from "../providers";
import { LedgerStore } from "../ledger";
import { CatalogCacheStore } from "../cache";
import { MasterKeyProvider } from "../master-key";
import { InMemoryPortsLayer } from "../in-memory";
import type { ProviderConfig } from "../../types/provider";
import type { LedgerEntry } from "../../types/usage";

describe("Gateway Storage Ports (In-Memory)", () => {
  it("stores and retrieves secrets via VaultStore", async () => {
    const program = Effect.gen(function* () {
      const vault = yield* VaultStore;
      yield* vault.setSecret("anthropic", "v1:iv:tag:cipher");
      const secret = yield* vault.getSecret("anthropic");
      const allKeys = yield* vault.listKeys();
      yield* vault.deleteSecret("anthropic");
      const deleted = yield* vault.getSecret("anthropic");
      return { secret, allKeys, deleted };
    }).pipe(Effect.provide(InMemoryPortsLayer));

    const result = await Effect.runPromise(program);
    assert.equal(result.secret, "v1:iv:tag:cipher");
    assert.deepEqual(result.allKeys, ["anthropic"]);
    assert.equal(result.deleted, null);
  });

  it("stores and retrieves providers via ProviderStore", async () => {
    const mockProvider: ProviderConfig = {
      id: "test-provider",
      name: "Test Provider",
      type: "openai",
      baseURL: "https://api.test.com/v1",
      models: [{ id: "m1", name: "Model 1" }],
    };

    const program = Effect.gen(function* () {
      const providers = yield* ProviderStore;
      yield* providers.saveProvider(mockProvider);
      const found = yield* providers.getProvider("test-provider");
      const all = yield* providers.listProviders();
      yield* providers.deleteProvider("test-provider");
      const deleted = yield* providers.getProvider("test-provider");
      return { found, all, deleted };
    }).pipe(Effect.provide(InMemoryPortsLayer));

    const result = await Effect.runPromise(program);
    assert.deepEqual(result.found, mockProvider);
    assert.equal(result.all.length, 1);
    assert.equal(result.deleted, null);
  });

  it("records turns and checks budget via LedgerStore", async () => {
    const entry: LedgerEntry = {
      id: "tx-1",
      sessionId: "session-123",
      turnId: "turn-1",
      providerId: "anthropic",
      modelId: "claude-3-7-sonnet",
      inputTokens: 100,
      outputTokens: 50,
      reasoningTokens: 20,
      cacheReadTokens: 10,
      cacheWrite5mTokens: 5,
      cacheWrite1hTokens: 0,
      costUsd: 0.0015,
      estimated: false,
      status: "completed",
      timestamp: Date.now(),
    };

    const program = Effect.gen(function* () {
      const ledger = yield* LedgerStore;
      const budgetBefore = yield* ledger.checkBudget("session-123");
      yield* ledger.recordTurnUsage(entry);
      const summary = yield* ledger.getSessionUsage("session-123");
      return { budgetBefore, summary };
    }).pipe(Effect.provide(InMemoryPortsLayer));

    const result = await Effect.runPromise(program);
    assert.equal(result.budgetBefore.allowed, true);
    assert.equal(result.summary.totalTokens, 185);
    assert.equal(result.summary.totalCostUsd, 0.0015);
  });

  it("stores and retrieves cached catalog via CatalogCacheStore", async () => {
    const program = Effect.gen(function* () {
      const cache = yield* CatalogCacheStore;
      const initial = yield* cache.getCachedCatalog();
      yield* cache.setCachedCatalog('{"models":[]}');
      const updated = yield* cache.getCachedCatalog();
      return { initial, updated };
    }).pipe(Effect.provide(InMemoryPortsLayer));

    const result = await Effect.runPromise(program);
    assert.equal(result.initial, null);
    assert.equal(result.updated, '{"models":[]}');
  });

  it("provides master key via MasterKeyProvider", async () => {
    const program = Effect.gen(function* () {
      const provider = yield* MasterKeyProvider;
      const key = yield* provider.getMasterKey();
      return key;
    }).pipe(Effect.provide(InMemoryPortsLayer));

    const result = await Effect.runPromise(program);
    assert.equal(Buffer.isBuffer(result), true);
    assert.equal(result.length, 32);
  });
});
