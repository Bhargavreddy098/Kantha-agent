import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Effect, Layer } from "effect";
import {
  GatewayService,
  GatewayServiceLive,
  VaultServiceLive,
  CatalogServiceLive,
  InMemoryPortsLayer,
  ProviderStore,
  LedgerStore,
  type InferenceRequest,
  type ProviderConfig,
} from "../index";

describe("GatewayService Assembly & Operations", () => {
  // Shared single-instance layer providing identical in-memory stores to all callers
  const createSharedLayer = () =>
    GatewayServiceLive.pipe(
      Layer.provide(VaultServiceLive),
      Layer.provide(CatalogServiceLive),
      Layer.provideMerge(InMemoryPortsLayer)
    );

  it("completes inference request and returns aggregated response with token usage", async () => {
    const sharedLayer = createSharedLayer();

    const program = Effect.gen(function* () {
      const providerStore = yield* ProviderStore;
      const gateway = yield* GatewayService;

      const mockProvider: ProviderConfig = {
        id: "test-anthropic",
        name: "Test Anthropic",
        type: "anthropic",
        apiKey: "sk-ant-test",
        baseURL: "mock://anthropic",
        models: [{ id: "claude-3-7-sonnet" }],
      };

      yield* providerStore.saveProvider(mockProvider);

      const request: InferenceRequest = {
        providerId: "test-anthropic",
        modelId: "claude-3-7-sonnet",
        messages: [{ role: "user", content: "Hello gateway!" }],
        attribution: { sessionId: "session-123", turnId: "turn-1" },
      };

      return yield* gateway.complete(request);
    });

    const response = await Effect.runPromise(program.pipe(Effect.provide(sharedLayer)));

    assert.ok(response);
    assert.ok(response.text.includes("Mock response"));
    assert.equal(response.finishReason, "stop");
    assert.equal(response.usage.inputTokens, 120);
    assert.equal(response.usage.outputTokens, 45);
  });

  it("blocks stream when session budget is exceeded", async () => {
    const DeniedLedgerLayer = Layer.sync(LedgerStore, () => ({
      checkBudget: () => Effect.succeed({ allowed: false, remainingUsd: 0 }),
      recordTurnUsage: () => Effect.void,
      getSessionUsage: () =>
        Effect.succeed({
          sessionId: "session-exceeded",
          totalInputTokens: 0,
          totalOutputTokens: 0,
          totalReasoningTokens: 0,
          totalCacheReadTokens: 0,
          totalCacheWriteTokens: 0,
          totalTokens: 0,
          totalCostUsd: 100,
          turnCount: 5,
        }),
    }));

    const customLayer = GatewayServiceLive.pipe(
      Layer.provide(VaultServiceLive),
      Layer.provide(CatalogServiceLive),
      Layer.provideMerge(DeniedLedgerLayer),
      Layer.provideMerge(InMemoryPortsLayer)
    );

    const program = Effect.gen(function* () {
      const providerStore = yield* ProviderStore;
      const gateway = yield* GatewayService;

      const mockProvider: ProviderConfig = {
        id: "test-provider",
        name: "Test Provider",
        type: "openai",
        apiKey: "sk-test",
        baseURL: "mock://openai",
        models: [{ id: "gpt-4o" }],
      };
      yield* providerStore.saveProvider(mockProvider);

      const request: InferenceRequest = {
        providerId: "test-provider",
        modelId: "gpt-4o",
        messages: [{ role: "user", content: "Hello" }],
        attribution: { sessionId: "session-exceeded" },
      };

      return yield* gateway.complete(request);
    });

    await assert.rejects(
      async () => {
        await Effect.runPromise(program.pipe(Effect.provide(customLayer)));
      },
      (err: any) => {
        const errStr = String(err);
        assert.ok(
          errStr.includes("BudgetExceededError") || errStr.includes("budget") || errStr.includes("Budget"),
          `Expected budget error, got: ${errStr}`
        );
        return true;
      }
    );
  });

  it("retrieves catalog metadata", async () => {
    const sharedLayer = createSharedLayer();
    const program = Effect.gen(function* () {
      const gateway = yield* GatewayService;
      return yield* gateway.getCatalog();
    });

    const catalog = await Effect.runPromise(program.pipe(Effect.provide(sharedLayer)));

    assert.ok(catalog);
    assert.ok(Array.isArray(catalog.models));
    assert.ok(catalog.models.length > 0);
  });

  it("tests connection to a configured provider", async () => {
    const sharedLayer = createSharedLayer();

    const program = Effect.gen(function* () {
      const providerStore = yield* ProviderStore;
      const gateway = yield* GatewayService;

      yield* providerStore.saveProvider({
        id: "local-ollama",
        name: "Local Ollama",
        type: "ollama",
        isLocal: true,
        baseURL: "http://127.0.0.1:11434",
        models: [{ id: "llama3.2" }],
      });

      return yield* gateway.testConnection("local-ollama");
    });

    const result = await Effect.runPromise(program.pipe(Effect.provide(sharedLayer)));

    assert.equal(result.success, true, `Expected success, got error: ${result.error}`);
    assert.ok(typeof result.latencyMs === "number");
  });

  it("enforces SSRF protection in Phase 2 passthrough interface", async () => {
    const sharedLayer = createSharedLayer();

    const program = Effect.gen(function* () {
      const gateway = yield* GatewayService;

      return yield* gateway.passthrough({
        family: "openai",
        endpoint: "http://169.254.169.254/latest/meta-data",
        rawHeaders: {},
        rawBody: {},
      });
    });

    await assert.rejects(
      async () => {
        await Effect.runPromise(program.pipe(Effect.provide(sharedLayer)));
      },
      (err: any) => {
        const errStr = String(err);
        assert.ok(
          errStr.includes("SSRF") || errStr.includes("Metadata") || errStr.includes("rejected"),
          `Expected SSRF error, got: ${errStr}`
        );
        return true;
      }
    );
  });
});
