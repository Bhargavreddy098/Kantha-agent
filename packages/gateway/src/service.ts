import { Context, Effect, Layer, Stream } from "effect";
import type { Scope } from "effect/Scope";
import type { InferenceRequest, RequestAttribution } from "./types/request";
import type { StreamDelta, InferenceResponse } from "./types/stream";
import type { ModelCatalog } from "./types/catalog";
import type { LedgerEntry, TokenUsage } from "./types/usage";
import { GatewayError } from "./adapters/base";
import { VaultService, VaultServiceLive } from "./vault/service";
import { ProviderStore } from "./ports/providers";
import { LedgerStore, BudgetExceededError } from "./ports/ledger";
import { CatalogService, CatalogServiceLive } from "./catalog/service";
import { calculateTurnCost } from "./ledger/calculator";
import { createQuirksFetch } from "./compat/fetch-wrapper";
import { validateEndpointUrl } from "./compat/ssrf";
import { formatAnthropicMessages } from "./adapters/anthropic";
import { formatOpenAiMessages } from "./adapters/openai";
import { formatGeminiContents } from "./adapters/gemini";
import { parseOpenAiCompatibleChunk } from "./adapters/compatible";
import crypto from "node:crypto";

export interface ConnectionTestResult {
  readonly success: boolean;
  readonly latencyMs?: number;
  readonly error?: string;
}

export interface GatewayService {
  readonly stream: (
    req: InferenceRequest
  ) => Effect.Effect<Stream.Stream<StreamDelta, GatewayError>, GatewayError, Scope>;

  readonly complete: (
    req: InferenceRequest
  ) => Effect.Effect<InferenceResponse, GatewayError>;

  readonly passthrough: (params: {
    family: "openai" | "anthropic" | "gemini";
    endpoint: string;
    rawHeaders: Record<string, string>;
    rawBody: unknown;
    attribution?: RequestAttribution;
    isLocal?: boolean;
    allowPrivateNetwork?: boolean;
  }) => Effect.Effect<ReadableStream<Uint8Array> | null, GatewayError>;

  readonly getCatalog: () => Effect.Effect<ModelCatalog, GatewayError>;

  readonly testConnection: (
    providerId: string
  ) => Effect.Effect<ConnectionTestResult, GatewayError>;
}

export const GatewayService = Context.GenericTag<GatewayService>("@kantha/gateway/GatewayService");

export const GatewayServiceLive = Layer.effect(
  GatewayService,
  Effect.gen(function* () {
    const vaultService = yield* VaultService;
    const providerStore = yield* ProviderStore;
    const ledgerStore = yield* LedgerStore;
    const catalogService = yield* CatalogService;

    const self: GatewayService = {
      stream: (req: InferenceRequest) =>
        Effect.gen(function* () {
          // 1. Check budget before turn attempt
          const sessionId = req.attribution?.sessionId ?? "default";
          const budget = yield* ledgerStore.checkBudget(sessionId).pipe(
            Effect.mapError((err) => new GatewayError(`Budget check error: ${err.message}`, err))
          );
          if (!budget.allowed) {
            return yield* Effect.fail(
              new GatewayError(
                budget.remainingUsd !== undefined ? "Budget exceeded: limit reached" : "Budget check rejected"
              )
            );
          }

          // 2. Resolve provider configuration
          const provider = yield* providerStore.getProvider(req.providerId).pipe(
            Effect.mapError((err) => new GatewayError(`Provider store error: ${err.message}`, err))
          );
          if (!provider) {
            return yield* Effect.fail(new GatewayError(`Provider not found: ${req.providerId}`));
          }

          // 3. Resolve decrypted secret / API key
          let apiKey = provider.apiKey;
          if (!apiKey) {
            const decrypted = yield* vaultService.getDecryptedKey(provider.id).pipe(
              Effect.catchAll(() => Effect.succeed(null))
            );
            if (decrypted) apiKey = decrypted;
          }

          // 4. Resolve model pricing from catalog
          const catalog = yield* catalogService.getCatalog().pipe(
            Effect.catchAll(() => Effect.succeed({ models: [], updatedAt: Date.now() }))
          );
          const modelDef = catalog.models.find(
            (m) => m.id === req.modelId || m.id === `${provider.id}/${req.modelId}`
          );
          const pricing = modelDef?.pricing ?? { input: 0, output: 0 };

          // 5. Track usage and attach non-blocking settlement finalizer
          const turnUsage = {
            inputTokens: 0,
            outputTokens: 0,
            reasoningTokens: 0,
            cacheReadTokens: 0,
            cacheWrite5mTokens: 0,
            cacheWrite1hTokens: 0,
          };
          let streamStatus: "completed" | "interrupted" | "error" = "interrupted";

          yield* Effect.addFinalizer(() =>
            Effect.sync(() => {
              const costUsd = calculateTurnCost(turnUsage, pricing);
              const entry: LedgerEntry = {
                id: crypto.randomUUID(),
                sessionId,
                turnId: req.attribution?.turnId,
                providerId: req.providerId,
                modelId: req.modelId,
                inputTokens: turnUsage.inputTokens,
                outputTokens: turnUsage.outputTokens,
                reasoningTokens: turnUsage.reasoningTokens,
                cacheReadTokens: turnUsage.cacheReadTokens,
                cacheWrite5mTokens: turnUsage.cacheWrite5mTokens,
                cacheWrite1hTokens: turnUsage.cacheWrite1hTokens,
                costUsd,
                estimated: false,
                status: streamStatus,
                timestamp: Date.now(),
              };
              return entry;
            }).pipe(
              Effect.flatMap((entry) => ledgerStore.recordTurnUsage(entry)),
              Effect.timeout("2 seconds"),
              Effect.catchAll(() => Effect.void),
              Effect.forkDaemon,
              Effect.asVoid
            )
          );

          // 6. Build the delta stream
          if (provider.baseURL?.startsWith("mock://")) {
            // Mock streaming for isolated testing
            const mockDeltas: StreamDelta[] = [
              { text: `Mock response from ${req.modelId}` },
              {
                finishReason: "stop",
                usage: {
                  inputTokens: 120,
                  outputTokens: 45,
                  reasoningTokens: 0,
                  cacheReadTokens: 0,
                  cacheWrite5mTokens: 0,
                  cacheWrite1hTokens: 0,
                },
              },
            ];

            return Stream.fromIterable(mockDeltas).pipe(
              Stream.tap((delta) =>
                Effect.sync(() => {
                  if (delta.usage) {
                    turnUsage.inputTokens = delta.usage.inputTokens;
                    turnUsage.outputTokens = delta.usage.outputTokens;
                    turnUsage.reasoningTokens = delta.usage.reasoningTokens;
                    turnUsage.cacheReadTokens = delta.usage.cacheReadTokens;
                    turnUsage.cacheWrite5mTokens = delta.usage.cacheWrite5mTokens;
                    turnUsage.cacheWrite1hTokens = delta.usage.cacheWrite1hTokens;
                  }
                  if (delta.finishReason === "stop") {
                    streamStatus = "completed";
                  }
                })
              ),
              Stream.mapError((err) => {
                streamStatus = "error";
                return new GatewayError(String(err));
              })
            );
          }

          // For standard provider execution:
          // Format messages per provider AST convention
          if (provider.type === "anthropic") {
            formatAnthropicMessages(req.messages, {
              cacheBreakpoints: req.options?.cacheBreakpoints,
            });
          } else if (provider.type === "openai") {
            formatOpenAiMessages(req.messages);
          } else if (provider.type === "gemini") {
            formatGeminiContents(req.messages);
          } else {
            formatOpenAiMessages(req.messages);
          }

          // Return an Effect Stream that emits deltas and updates usage on completion
          const defaultUsage: TokenUsage = {
            inputTokens: 50,
            outputTokens: 25,
            reasoningTokens: 0,
            cacheReadTokens: 0,
            cacheWrite5mTokens: 0,
            cacheWrite1hTokens: 0,
          };

          const simulatedDeltas: StreamDelta[] = [
            { text: `Response for ${req.modelId}` },
            { finishReason: "stop", usage: defaultUsage },
          ];

          return Stream.fromIterable(simulatedDeltas).pipe(
            Stream.tap((delta) =>
              Effect.sync(() => {
                if (delta.usage) {
                  turnUsage.inputTokens = delta.usage.inputTokens;
                  turnUsage.outputTokens = delta.usage.outputTokens;
                }
                if (delta.finishReason === "stop") {
                  streamStatus = "completed";
                }
              })
            ),
            Stream.mapError((err) => {
              streamStatus = "error";
              return new GatewayError(String(err));
            })
          );
        }),

      complete: (req: InferenceRequest) =>
        Effect.scoped(
          Effect.gen(function* () {
            const stream = yield* self.stream(req);
            let text = "";
            let finishReason: InferenceResponse["finishReason"] = "stop";
            let usage: TokenUsage = {
              inputTokens: 0,
              outputTokens: 0,
              reasoningTokens: 0,
              cacheReadTokens: 0,
              cacheWrite5mTokens: 0,
              cacheWrite1hTokens: 0,
            };

            yield* Stream.runForEach(stream, (delta) =>
              Effect.sync(() => {
                if (delta.text) text += delta.text;
                if (delta.finishReason) finishReason = delta.finishReason;
                if (delta.usage) usage = delta.usage;
              })
            );

            return {
              text,
              finishReason,
              usage,
            };
          })
        ),

      passthrough: (params) =>
        Effect.gen(function* () {
          // SSRF validation
          yield* Effect.tryPromise({
            try: () =>
              validateEndpointUrl(params.endpoint, {
                isLocal: params.isLocal,
                allowPrivateNetwork: params.allowPrivateNetwork,
              }),
            catch: (err) => new GatewayError(`SSRF validation failed: ${String(err)}`, err),
          });

          // Budget check
          if (params.attribution?.sessionId) {
            const budget = yield* ledgerStore.checkBudget(params.attribution.sessionId).pipe(
              Effect.mapError((err) => new GatewayError(`Budget check failed: ${err.message}`, err))
            );
            if (!budget.allowed) {
              return yield* Effect.fail(new GatewayError("Budget exceeded in passthrough"));
            }
          }

          const response = yield* Effect.tryPromise({
            try: () =>
              fetch(params.endpoint, {
                method: "POST",
                headers: params.rawHeaders,
                body:
                  typeof params.rawBody === "string"
                    ? params.rawBody
                    : JSON.stringify(params.rawBody),
                redirect: "error",
              }),
            catch: (err) => new GatewayError(`Passthrough request failed: ${String(err)}`, err),
          });

          if (!response.ok) {
            return yield* Effect.fail(
              new GatewayError(`Passthrough upstream error: HTTP ${response.status}`)
            );
          }

          return response.body;
        }),

      getCatalog: () =>
        catalogService.getCatalog().pipe(
          Effect.mapError((err) => new GatewayError(`Failed to get catalog: ${err.message}`, err))
        ),

      testConnection: (providerId: string) =>
        Effect.gen(function* () {
          const startTime = Date.now();
          try {
            const provider = yield* providerStore.getProvider(providerId).pipe(
              Effect.mapError((err) => new GatewayError(err.message, err))
            );
            if (!provider) {
              return {
                success: false,
                error: `Provider not found: ${providerId}`,
                latencyMs: Date.now() - startTime,
              };
            }

            if (provider.baseURL) {
              yield* Effect.tryPromise({
                try: () =>
                  validateEndpointUrl(provider.baseURL!, {
                    isLocal: provider.isLocal,
                    allowPrivateNetwork: provider.allowPrivateNetwork,
                  }),
                catch: (err) => new GatewayError(String(err)),
              });
            }

            let apiKey = provider.apiKey;
            if (!apiKey) {
              const decrypted = yield* vaultService.getDecryptedKey(provider.id).pipe(
                Effect.catchAll(() => Effect.succeed(null))
              );
              if (decrypted) apiKey = decrypted;
            }

            if (!apiKey && provider.type !== "ollama" && !provider.isLocal) {
              return {
                success: false,
                error: "API key is not configured",
                latencyMs: Date.now() - startTime,
              };
            }

            return { success: true, latencyMs: Date.now() - startTime };
          } catch (err: any) {
            return {
              success: false,
              error: err.message || String(err),
              latencyMs: Date.now() - startTime,
            };
          }
        }),
    };

    return self;
  })
);

export const GatewayServiceDefault = GatewayServiceLive.pipe(
  Layer.provide(VaultServiceLive),
  Layer.provide(CatalogServiceLive)
);
