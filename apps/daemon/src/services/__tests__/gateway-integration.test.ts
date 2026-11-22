import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Effect } from "effect";
import { createKanthaDb } from "@kantha/db";
import {
  GatewayService,
  VaultStore,
  LedgerStore,
  ProviderStore,
  CatalogCacheStore,
  MasterKeyProvider,
} from "@kantha/gateway";
import { createDaemonGatewayLayer } from "../gateway";

describe("Daemon Concrete Gateway Layers Integration", () => {
  it("initializes daemon gateway layer with sqlite and file stores", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kantha-gateway-test-"));
    const dbPath = path.join(tempDir, "test.sqlite");

    try {
      const { db } = await createKanthaDb({ dbPath });
      const daemonLayer = createDaemonGatewayLayer({ db, dataDir: tempDir });

      const program = Effect.gen(function* () {
        const masterKeyProvider = yield* MasterKeyProvider;
        const vaultStore = yield* VaultStore;
        const ledgerStore = yield* LedgerStore;
        const providerStore = yield* ProviderStore;
        const catalogCache = yield* CatalogCacheStore;
        const gateway = yield* GatewayService;

        // 1. MasterKeyProvider generates 32-byte key on disk
        const key = yield* masterKeyProvider.getMasterKey();
        assert.equal(key.length, 32);

        // 2. VaultStore writes and reads from SQLite gateway_secrets table
        yield* vaultStore.setSecret("test-secret", "v1:iv:tag:ciphertext");
        const secret = yield* vaultStore.getSecret("test-secret");
        assert.equal(secret, "v1:iv:tag:ciphertext");

        // 3. LedgerStore records turn usage and retrieves session summary from SQLite usage_ledger table
        yield* ledgerStore.recordTurnUsage({
          id: "turn-entry-1",
          sessionId: "test-session",
          turnId: "turn-1",
          providerId: "anthropic",
          modelId: "claude-3-7-sonnet",
          inputTokens: 100,
          outputTokens: 50,
          reasoningTokens: 20,
          cacheReadTokens: 10,
          cacheWrite5mTokens: 5,
          cacheWrite1hTokens: 0,
          costUsd: 0.005,
          estimated: false,
          status: "completed",
          timestamp: Date.now(),
        });

        const usageSummary = yield* ledgerStore.getSessionUsage("test-session");
        assert.equal(usageSummary.turnCount, 1);
        assert.equal(usageSummary.totalInputTokens, 100);
        assert.equal(usageSummary.totalOutputTokens, 50);
        assert.equal(usageSummary.totalCostUsd, 0.005);

        // 4. ProviderStore lists built-in and saved custom providers
        yield* providerStore.saveProvider({
          id: "my-custom-llm",
          name: "My Custom LLM",
          type: "openai_compatible",
          baseURL: "http://127.0.0.1:8000/v1",
          models: [{ id: "custom-model" }],
        });
        const customP = yield* providerStore.getProvider("my-custom-llm");
        assert.ok(customP);
        assert.equal(customP?.id, "my-custom-llm");

        // 5. CatalogCacheStore writes and reads cache file
        yield* catalogCache.setCachedCatalog(
          JSON.stringify({ models: [{ id: "test/model-1", name: "Test Model" }], updatedAt: 123 })
        );
        const cached = yield* catalogCache.getCachedCatalog();
        assert.ok(cached?.includes("updatedAt"));

        // 6. GatewayService is fully functional
        const catalog = yield* gateway.getCatalog();
        assert.ok(catalog.models.length > 0);

        return true;
      });

      const success = await Effect.runPromise(program.pipe(Effect.provide(daemonLayer)));
      assert.equal(success, true);
    } finally {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Temp cleanup
      }
    }
  });
});
