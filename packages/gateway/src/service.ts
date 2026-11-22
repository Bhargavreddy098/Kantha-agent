import { Context, Effect, Layer, Stream } from "effect";
import type { Scope } from "effect/Scope";
import type { InferenceRequest, RequestAttribution, KanthaMessage, KanthaTool } from "./types/request";
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
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { streamText, type ModelMessage } from "ai";
import crypto from "node:crypto";

function toModelMessages(messages: KanthaMessage[]): ModelMessage[] {
  const result: ModelMessage[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      const content =
        typeof msg.content === "string"
          ? msg.content
          : msg.content
              .filter((p) => p.type === "text")
              .map((p) => (p as any).text)
              .join("\n");
      result.push({ role: "system", content });
    } else if (msg.role === "user") {
      if (typeof msg.content === "string") {
        result.push({ role: "user", content: msg.content });
      } else {
        const parts: any[] = [];
        for (const p of msg.content) {
          if (p.type === "text") {
            parts.push({ type: "text", text: p.text });
          } else if (p.type === "image") {
            parts.push({ type: "image", image: p.image, mimeType: p.mimeType });
          }
        }
        result.push({ role: "user", content: parts });
      }
    } else if (msg.role === "assistant") {
      const parts: any[] = [];
      if (msg.reasonings && msg.reasonings.length > 0) {
        for (const r of msg.reasonings) {
          parts.push({
            type: "reasoning",
            text: r.text || "",
            signature: r.signature,
            providerMetadata: r.providerMetadata,
          });
        }
      }
      if (typeof msg.content === "string") {
        if (msg.content.length > 0) {
          parts.push({ type: "text", text: msg.content });
        }
      } else if (Array.isArray(msg.content)) {
        for (const p of msg.content) {
          if (p.type === "text") {
            parts.push({ type: "text", text: p.text });
          }
        }
      }
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        for (const tc of msg.toolCalls) {
          parts.push({
            type: "tool-call",
            toolCallId: tc.id,
            toolName: tc.name,
            input: tc.arguments ?? {},
          });
        }
      }

      if (parts.length === 0) {
        result.push({ role: "assistant", content: "" });
      } else if (parts.length === 1 && parts[0].type === "text" && !msg.reasonings?.length && !msg.toolCalls?.length) {
        result.push({ role: "assistant", content: parts[0].text });
      } else {
        result.push({ role: "assistant", content: parts as any });
      }
    } else if (msg.role === "tool") {
      const toolParts: any[] = [];
      if (msg.toolResults && msg.toolResults.length > 0) {
        for (const tr of msg.toolResults) {
          toolParts.push({
            type: "tool-result",
            toolCallId: tr.callId,
            toolName: tr.toolName,
            output:
              typeof tr.content === "string"
                ? { type: "text", value: tr.content }
                : { type: "json", value: tr.content },
          });
        }
      }
      if (toolParts.length > 0) {
        result.push({ role: "tool", content: toolParts as any });
      }
    }
  }

  return result;
}

function formatTools(tools?: KanthaTool[]): Record<string, any> | undefined {
  if (!tools || tools.length === 0) return undefined;
  const result: Record<string, any> = {};
  for (const t of tools) {
    result[t.name] = {
      description: t.description,
      parameters: t.parameters,
    };
  }
  return result;
}

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
              Effect.asVoid
            )
          );

          // 6. Build the delta stream
          if (provider.baseURL?.startsWith("mock://")) {
            if (process.env.NODE_ENV !== "test") {
              return yield* Effect.fail(
                new GatewayError("mock:// base URLs are only permitted in test environment")
              );
            }

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

          // Real Upstream Provider Streaming
          const quirksFetch = createQuirksFetch(provider);

          let model: any;
          if (provider.type === "anthropic") {
            const anthropic = createAnthropic({
              apiKey: apiKey || "dummy-key",
              baseURL: provider.baseURL,
              headers: provider.headers,
              fetch: quirksFetch,
            });
            model = anthropic(req.modelId);
          } else if (provider.type === "openai") {
            const openai = createOpenAI({
              apiKey: apiKey || "dummy-key",
              baseURL: provider.baseURL,
              headers: provider.headers,
              fetch: quirksFetch,
            });
            model = openai(req.modelId);
          } else if (provider.type === "gemini") {
            const google = createGoogleGenerativeAI({
              apiKey: apiKey || "dummy-key",
              baseURL: provider.baseURL,
              headers: provider.headers,
              fetch: quirksFetch,
            });
            model = google(req.modelId);
          } else {
            // openai_compatible, ollama, or custom
            const custom = createOpenAICompatible({
              name: provider.id,
              apiKey: apiKey || "dummy-key",
              baseURL: provider.baseURL || "https://api.openai.com/v1",
              headers: provider.headers,
              fetch: quirksFetch,
            });
            model = custom(req.modelId);
          }

          const abortController = new AbortController();
          yield* Effect.addFinalizer(() =>
            Effect.sync(() => {
              abortController.abort();
            })
          );

          const modelMessages = toModelMessages(req.messages);
          const tools = formatTools(req.tools);

          let result: any;
          try {
            result = streamText({
              model,
              messages: modelMessages,
              tools,
              temperature: req.options?.temperature,
              maxOutputTokens: req.options?.maxTokens,
              abortSignal: abortController.signal,
              maxRetries: 0,
            });
          } catch (err) {
            streamStatus = "error";
            return yield* Effect.fail(new GatewayError(String(err), err));
          }

          async function* iterateParts() {
            for await (const part of result.fullStream) {
              if (part.type === "text-delta") {
                const text = (part as any).delta ?? (part as any).text ?? "";
                if (text) {
                  yield { text } satisfies StreamDelta;
                }
              } else if (part.type === "reasoning-delta") {
                const text = (part as any).delta ?? (part as any).text ?? "";
                if (text) {
                  yield {
                    reasonings: [
                      {
                        type: "thinking",
                        text,
                        providerMetadata: (part as any).providerMetadata,
                      },
                    ],
                  } satisfies StreamDelta;
                }
              } else if (part.type === "tool-call") {
                yield {
                  toolCalls: [
                    {
                      id: (part as any).toolCallId ?? (part as any).id,
                      name: (part as any).toolName ?? (part as any).name,
                      arguments: (part as any).args ?? (part as any).input ?? {},
                    },
                  ],
                } satisfies StreamDelta;
              } else if (part.type === "finish") {
                const totalUsage = (part as any).totalUsage;
                const usage: TokenUsage = {
                  inputTokens: totalUsage?.inputTokens ?? 0,
                  outputTokens: totalUsage?.outputTokens ?? 0,
                  reasoningTokens: totalUsage?.outputTokenDetails?.reasoningTokens ?? 0,
                  cacheReadTokens: totalUsage?.inputTokenDetails?.cacheReadTokens ?? 0,
                  cacheWrite5mTokens: 0,
                  cacheWrite1hTokens: 0,
                };
                turnUsage.inputTokens = usage.inputTokens;
                turnUsage.outputTokens = usage.outputTokens;
                turnUsage.reasoningTokens = usage.reasoningTokens;
                turnUsage.cacheReadTokens = usage.cacheReadTokens;
                streamStatus = "completed";

                let finishReason: StreamDelta["finishReason"] = "stop";
                if ((part as any).finishReason === "tool-calls") finishReason = "tool_calls";
                else if ((part as any).finishReason === "length") finishReason = "length";
                else if ((part as any).finishReason === "error") finishReason = "error";

                yield { finishReason, usage } satisfies StreamDelta;
              } else if (part.type === "error") {
                streamStatus = "error";
                const errorMsg =
                  (part.error as any)?.message ?? String(part.error) ?? "Upstream streaming error";
                throw new GatewayError(errorMsg, part.error);
              }
            }
          }

          return Stream.fromAsyncIterable(iterateParts(), (err) => {
            streamStatus = "error";
            return err instanceof GatewayError ? err : new GatewayError(String(err), err);
          });
        }),

      complete: (req: InferenceRequest) =>
        Effect.scoped(
          Effect.gen(function* () {
            const stream = yield* self.stream(req);
            let text = "";
            let finishReason: InferenceResponse["finishReason"] = "stop";
            let reasonings: any[] | undefined;
            let toolCalls: any[] | undefined;
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
                if (delta.reasonings) {
                  reasonings = (reasonings || []).concat(delta.reasonings);
                }
                if (delta.toolCalls) {
                  toolCalls = (toolCalls || []).concat(delta.toolCalls);
                }
              })
            );

            return {
              text,
              reasonings,
              toolCalls,
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
