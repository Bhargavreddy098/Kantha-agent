import { randomUUID } from 'node:crypto';
import { APICallError, createUIMessageStreamResponse, streamText, type LanguageModelUsage, type UIMessageChunk } from 'ai';
import type { IConnectionStore, ISecretStore } from '../contracts/adapters';
import type { UIMessage } from '../contracts/chat';
import type { RequestContext } from '../contracts/context';
import { GatewayError } from '../contracts/errors';
import type { GatewayRun } from '../contracts/run';
import { buildChatPrompt } from '../providers/chat-prompt';
import { gatewayLanguageModel } from '../providers/language-model';
import type { ModelCatalog } from '../providers/model-catalog';
import { gatewayModelPrice, quoteTokenCost } from '../providers/pricing';
import type { GatewayRunService } from '../runs/session-service';
import type { GatewayCapacity } from './capacity';
import { readChatInput } from './chat-input';
import type { GatewayUsageService } from './usage-service';

const MAX_ASSISTANT_TEXT_LENGTH = 256_000;
const RUN_HEADER = 'x-kantha-run-id';
const SESSION_HEADER = 'x-kantha-session-id';

function providerError(error: unknown, ctx: RequestContext, timedOut: boolean): GatewayError {
  if (timedOut || (error instanceof Error && error.name === 'TimeoutError')) {
    return new GatewayError({
      code: 'upstream_timeout',
      message: 'The provider took too long to respond.',
      requestId: ctx.requestId,
    });
  }
  if (APICallError.isInstance(error)) {
    if (error.statusCode === 429) {
      const retryAfter = error.responseHeaders?.['retry-after'];
      const seconds = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) : undefined;
      return new GatewayError({
        code: 'rate_limited',
        message: 'The provider is rate-limiting requests. Try again later.',
        retryAfterSeconds: seconds !== undefined && Number.isSafeInteger(seconds) ? seconds : undefined,
        requestId: ctx.requestId,
      });
    }
    if (error.statusCode === 402) {
      return new GatewayError({
        code: 'budget_exceeded',
        message: 'Provider billing or subscription required: Please check your provider account balance or subscription.',
        requestId: ctx.requestId,
      });
    }
    if (error.statusCode === 401 || error.statusCode === 403) {
      return new GatewayError({
        code: 'upstream_failed',
        message: 'The provider rejected this connection. Ask an owner to check its credentials.',
        requestId: ctx.requestId,
      });
    }
  }
  return new GatewayError({
    code: 'upstream_failed',
    message: 'The provider could not complete the response.',
    requestId: ctx.requestId,
  });
}

function reportedTokens(usage: LanguageModelUsage | undefined) {
  if (usage?.inputTokens === undefined || usage.outputTokens === undefined) return undefined;
  const { inputTokens: prompt, outputTokens: completion, totalTokens = prompt + completion } = usage;
  if (![prompt, completion, totalTokens].every((value) => Number.isSafeInteger(value) && value >= 0)) {
    return undefined;
  }
  return { prompt, completion, total: Math.max(totalTokens, prompt + completion) };
}

function chatStreamHeaders(run: GatewayRun) {
  return {
    [RUN_HEADER]: run.id,
    [SESSION_HEADER]: run.sessionId,
    'cache-control': 'no-store, no-transform',
    'x-accel-buffering': 'no',
  };
}

type StartedChat =
  | { run: GatewayRun; replayed: true }
  | { run: GatewayRun; replayed: false; response: Response };

export class GatewayChatService {
  constructor(private readonly services: {
    modelCatalog: Pick<ModelCatalog, 'resolveChatSelection'>;
    connectionStore: Pick<IConnectionStore, 'getConnection'>;
    secretStore: Pick<ISecretStore, 'getSecret'>;
    inferenceCapacity: Pick<GatewayCapacity, 'acquire'>;
    runService: GatewayRunService;
    usageService: Pick<GatewayUsageService, 'reserveAttempt' | 'settleAttempt'>;
  }) {}

  async streamChat(raw: unknown, ctx: RequestContext): Promise<Response> {
    const started = await this.startRun(readChatInput(raw, ctx), ctx);
    if (!started.replayed) return started.response;
    return createUIMessageStreamResponse({
      headers: { ...chatStreamHeaders(started.run), 'x-kantha-replayed': 'true' },
      stream: new ReadableStream<UIMessageChunk>({
        start(controller) {
          controller.close();
        },
      }),
    });
  }

  async submitSessionRun(raw: unknown, sessionId: string, ctx: RequestContext) {
    const started = await this.startRun(readChatInput(raw, ctx, sessionId), ctx);
    if (!started.replayed) {
      // This caller observes the journal. The independent stream consumer owns finalization.
      await started.response.body?.cancel().catch(() => undefined);
    }
    return { run: started.run, replayed: started.replayed };
  }

  private async startRun(input: ReturnType<typeof readChatInput>, ctx: RequestContext): Promise<StartedChat> {
    const { modelCatalog, connectionStore, secretStore, inferenceCapacity, runService, usageService } = this.services;
    const { connectionId, modelId } = await modelCatalog.resolveChatSelection(input, ctx);

    if (input.sessionId) {
      const submission = { ...input, sessionId: input.sessionId, connectionId, modelId };
      const previous = await runService.getRunBySubmission(submission, ctx);
      if (previous) return { run: previous, replayed: true };
    }

    const connection = await connectionStore.getConnection(connectionId, ctx);
    if (!connection) {
      throw new GatewayError({ code: 'not_found', message: 'Provider connection was not found.', requestId: ctx.requestId });
    }
    if (connection.status !== 'active' || !connection.eligibleModels.includes(modelId)) {
      throw new GatewayError({
        code: 'invalid_request', message: 'The selected model is unavailable on this connection.',
        field: 'model', requestId: ctx.requestId,
      });
    }

    const secret = connection.secretRef
      ? await secretStore.getSecret(connection.secretRef, ctx)
      : null;
    if (connection.secretRef && !secret) {
      throw new GatewayError({ code: 'conflict', message: 'Provider credentials changed. Refresh the connection and try again.', requestId: ctx.requestId });
    }
    const price = gatewayModelPrice(connection, modelId, ctx);

    const release = inferenceCapacity.acquire(ctx);
    let run: GatewayRun;
    let sessionId: string;
    try {
      sessionId = input.sessionId ?? (await runService.createSession({}, ctx)).id;
      const started = await runService.beginRun({ ...input, sessionId, connectionId, modelId }, ctx);
      run = started.run;
      if (!started.created) {
        release();
        return { run, replayed: true };
      }
    } catch (error) {
      release();
      throw error;
    }

    const messageId = `assistant_${run.id}`;
    const startedAt = Date.now();
    const attemptId = randomUUID();
    const reservationId = randomUUID();
    const timeout = AbortSignal.timeout(55_000);
    const outputLimit = new AbortController();
    const runSignal = runService.getRunSignal(run.id, ctx);
    const signal = AbortSignal.any([runSignal, timeout, outputLimit.signal]);
    let networkDispatched = false;
    let reserved = false;
    let outputLength = 0;
    let finishing: Promise<void> | undefined;

    function finish(
      status: 'completed' | 'failed' | 'cancelled',
      details?: { text?: string; reasoning?: string; error?: GatewayError; usage?: LanguageModelUsage }
    ) {
      finishing ??= (async () => {
        if (reserved) {
          const tokens = reportedTokens(details?.usage);
          await usageService.settleAttempt({
            attemptId,
            reservationId,
            workspaceId: ctx.workspaceId,
            connectionId: run.connectionId,
            modelId: run.modelId,
            runId: run.id,
            status: networkDispatched ? 'settled' : 'refunded',
            tokens,
            costUsd: tokens ? quoteTokenCost(price, tokens.prompt, tokens.completion) : undefined,
            durationMs: Date.now() - startedAt,
          }, ctx);
        }
        const message: UIMessage | undefined = details?.text || details?.reasoning
          ? {
              id: messageId,
              role: 'assistant',
              content: details.text ?? '',
              parts: [
                ...(details.text ? [{ type: 'text', text: details.text }] : []),
                ...(details.reasoning ? [{ type: 'reasoning', text: details.reasoning }] : []),
              ],
            }
          : undefined;
        await runService.finishRun(run.id, { status, message, error: details?.error?.toEnvelope() }, ctx);
      })().finally(release);
      return finishing;
    }
    const finishError = (error: unknown) => runSignal.aborted
      ? finish('cancelled')
      : finish('failed', { error: providerError(error, ctx, timeout.aborted) });

    try {
      const snapshot = await runService.getSnapshot(sessionId, ctx);
      const { messages, estimatedInputTokens } = buildChatPrompt(snapshot.messages, input.system);
      reserved = await usageService.reserveAttempt({
        attemptId,
        reservationId,
        workspaceId: ctx.workspaceId,
        connectionId,
        modelId,
        runId: run.id,
        status: 'reserved',
        retryCount: 0,
        estimatedTokens: estimatedInputTokens + input.maxTokens,
        estimatedCostUsd: quoteTokenCost(price, estimatedInputTokens, input.maxTokens),
      }, ctx);
      if (!reserved) {
        throw new GatewayError({
          code: 'budget_exceeded',
          message: 'The workspace budget cannot admit this request.',
          requestId: ctx.requestId,
        });
      }
      signal.throwIfAborted();

      const result = streamText({
        model: gatewayLanguageModel(connection, modelId, secret, () => { networkDispatched = true; }),
        messages,
        system: input.system,
        temperature: input.temperature,
        maxOutputTokens: input.maxTokens,
        maxRetries: 0,
        abortSignal: signal,
        onChunk: async ({ chunk }) => {
          if (chunk.type !== 'text-delta' && chunk.type !== 'reasoning-delta') return;
          const delta = chunk.text;
          outputLength += delta.length;
          if (outputLength > MAX_ASSISTANT_TEXT_LENGTH) {
            outputLimit.abort();
            return finishError(outputLimit.signal.reason);
          }
          if (chunk.type === 'text-delta') await runService.appendAssistantDelta(run.id, messageId, delta, ctx);
        },
        onEnd: async ({ text, reasoningText, usage, finishReason }) => {
          if (signal.aborted || finishReason === 'error') {
            await finishError(signal.reason);
            return;
          }
          await finish('completed', { text, reasoning: reasoningText, usage });
        },
        onError: ({ error }) => finishError(error),
        onAbort: () => finishError(signal.reason),
      });

      const response = result.toUIMessageStreamResponse({
        headers: chatStreamHeaders(run),
        generateMessageId: () => messageId,
        messageMetadata: ({ part }) => part.type === 'start' || part.type === 'finish'
          ? { runId: run.id, sessionId }
          : undefined,
        sendReasoning: true,
        onError: (error) => providerError(error, ctx, timeout.aborted).message,
        consumeSseStream: async ({ stream }) => {
          // Keep writing the journal when the browser disconnects. Explicit Stop cancels by run ID.
          try {
            await stream.pipeTo(new WritableStream<string>());
            if (!finishing) await finishError(new Error('Provider stream closed without a terminal frame'));
          } catch (error) {
            try {
              await finishError(error);
            } catch {
              console.error('Gateway could not finalize run', ctx.requestId);
            }
          }
        },
      });

      return { run, response, replayed: false };
    } catch (error) {
      const failure = error instanceof GatewayError ? error : providerError(error, ctx, timeout.aborted);
      if (runSignal.aborted) await finish('cancelled');
      else await finish('failed', { error: failure });
      throw failure;
    }
  }
}
