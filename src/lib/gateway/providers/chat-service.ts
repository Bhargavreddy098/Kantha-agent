import { createHash, randomUUID } from 'node:crypto';
import { APICallError, createUIMessageStreamResponse } from 'ai';
import type { LanguageModelUsage, ModelMessage, UIMessageChunk } from 'ai';
import type { UIMessage } from '../contracts/chat';
import type { RequestContext } from '../contracts/context';
import { GatewayError } from '../contracts/errors';
import type { GatewayRun } from '../contracts/run';
import { getGatewayRegistry } from '../server/registry';
import { gatewayModelPrice, quoteTokenCost } from './pricing';

const DEFAULT_MAX_OUTPUT_TOKENS = 2048;
const MAX_OUTPUT_TOKENS = 8192;
const MAX_ASSISTANT_TEXT_LENGTH = 256_000;
const RUN_HEADER = 'x-kantha-run-id';
const SESSION_HEADER = 'x-kantha-session-id';

function invalidChat(ctx: RequestContext, message: string, field?: string): never {
  throw new GatewayError({ code: 'invalid_request', message, field, requestId: ctx.requestId });
}

function readOptionalChatString(
  body: Record<string, unknown>,
  field: string,
  ctx: RequestContext,
  maxLength = 256
): string | undefined {
  const value = body[field];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength || value.includes('\0')) {
    return invalidChat(ctx, `Invalid ${field}.`, field);
  }
  return value.trim();
}

function readTextMessage(value: unknown, fallbackId: string, ctx: RequestContext): UIMessage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return invalidChat(ctx, 'Each chat message must be an object.', 'messages');
  }
  const message = value as Record<string, unknown>;
  if (message.role !== 'user' && message.role !== 'assistant') {
    return invalidChat(ctx, 'Chat accepts user and assistant text messages.', 'messages');
  }

  let content: string;
  if (Array.isArray(message.parts)) {
    const chunks: string[] = [];
    for (const part of message.parts) {
      if (part?.type === 'file') {
        return invalidChat(ctx, 'Provider chat currently accepts text only.', 'messages');
      }
      if (part?.type === 'text' && typeof part.text === 'string') chunks.push(part.text);
    }
    content = chunks.join('');
  } else {
    content = typeof message.content === 'string' ? message.content : typeof message.text === 'string' ? message.text : '';
  }

  if (message.role === 'user' && !content.trim()) {
    return invalidChat(ctx, 'A user message must contain text.', 'messages');
  }
  if (message.id !== undefined && (typeof message.id !== 'string' || !message.id.trim() || message.id.length > 256)) {
    return invalidChat(ctx, 'Invalid message ID.', 'messages');
  }

  return {
    id: typeof message.id === 'string' ? message.id : fallbackId,
    role: message.role,
    content,
    parts: [{ type: 'text', text: content }],
  };
}

function readChatInput(raw: unknown, ctx: RequestContext, sessionPath?: string) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return invalidChat(ctx, 'A JSON chat request is required.');
  }
  const body = raw as Record<string, unknown>;
  if ('baseUrl' in body || 'apiKey' in body || 'endpoint' in body) {
    return invalidChat(ctx, 'Use a configured provider connection for chat.', 'connectionId');
  }

  const sessionId = sessionPath ?? readOptionalChatString(body, 'sessionId', ctx);
  const submissionKey = readOptionalChatString(body, 'submissionKey', ctx);
  const modelId = readOptionalChatString(body, sessionPath ? 'modelId' : 'model', ctx);
  const connectionId = readOptionalChatString(body, 'connectionId', ctx);
  const system = readOptionalChatString(body, 'system', ctx, 8192);
  const temperature = body.temperature;
  const maxTokens = body.maxTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
  if (
    typeof maxTokens !== 'number' ||
    !Number.isInteger(maxTokens) ||
    maxTokens < 1 ||
    maxTokens > MAX_OUTPUT_TOKENS
  ) {
    return invalidChat(ctx, `maxTokens must be between 1 and ${MAX_OUTPUT_TOKENS}.`, 'maxTokens');
  }
  if (
    temperature !== undefined &&
    (typeof temperature !== 'number' || !Number.isFinite(temperature) || temperature < 0 || temperature > 2)
  ) {
    return invalidChat(ctx, 'temperature must be between 0 and 2.', 'temperature');
  }

  const rawMessages: unknown = sessionPath ? body.inputMessages : body.messages;
  if (!Array.isArray(rawMessages) || rawMessages.length === 0 || rawMessages.length > 500) {
    return invalidChat(ctx, 'Supply between 1 and 500 chat messages.', 'messages');
  }
  if (sessionPath && (!submissionKey || !modelId)) {
    return invalidChat(ctx, 'A submission key and model ID are required for this run.');
  }

  // Existing sessions take their history from the journal. Only the new user turn comes from the client.
  const incoming = sessionId ? rawMessages.slice(-1) : rawMessages;
  const fallbackId = submissionKey
    ? `message_${createHash('sha256').update(submissionKey).digest('hex').slice(0, 32)}`
    : `message_${randomUUID()}`;
  const inputMessages = incoming.map((value, index) =>
    readTextMessage(value, `${fallbackId}_${index}`, ctx)
  );
  const lastMessage = inputMessages[inputMessages.length - 1];
  if (lastMessage.role !== 'user') {
    return invalidChat(ctx, 'The last chat message must be from the user.', 'messages');
  }

  return {
    connectionId,
    modelId,
    sessionId,
    submissionKey: submissionKey ?? lastMessage.id,
    inputMessages,
    system,
    temperature,
    maxTokens,
  };
}

function providerError(error: unknown, ctx: RequestContext, timedOut: boolean): GatewayError {
  if (timedOut || (error instanceof Error && error.name === 'TimeoutError')) {
    return new GatewayError({
      code: 'upstream_timeout',
      message: 'The provider took too long to respond.',
      requestId: ctx.requestId,
    });
  }
  if (APICallError.isInstance(error) && error.statusCode === 429) {
    const retryAfter = error.responseHeaders?.['retry-after'];
    const seconds = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) : undefined;
    return new GatewayError({
      code: 'rate_limited',
      message: 'The provider is rate-limiting requests. Try again later.',
      retryAfterSeconds: seconds !== undefined && Number.isSafeInteger(seconds) ? seconds : undefined,
      requestId: ctx.requestId,
    });
  }
  const message = APICallError.isInstance(error) && (error.statusCode === 401 || error.statusCode === 403)
    ? 'The provider rejected this connection. Ask an owner to check its credentials.'
    : 'The provider could not complete the response.';
  return new GatewayError({ code: 'upstream_failed', message, requestId: ctx.requestId });
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

function replayChatRun(run: GatewayRun) {
  return {
    run,
    replayed: true,
    response: createUIMessageStreamResponse({
      headers: { ...chatStreamHeaders(run), 'x-kantha-replayed': 'true' },
      stream: new ReadableStream<UIMessageChunk>({
        start(controller) {
          controller.close();
        },
      }),
    }),
  };
}

/** Starts one durable run and returns its standard AI SDK browser stream. */
export async function startGatewayChat(raw: unknown, ctx: RequestContext, sessionPath?: string) {
  const input = readChatInput(raw, ctx, sessionPath);
  const registry = getGatewayRegistry();
  let { connectionId, modelId } = input;
  if (!connectionId || !modelId) {
    const connections = await registry.connectionStore.listConnections(ctx);
    const selected = connections.find((connection) =>
      connection.status === 'active' &&
      (!connectionId || connection.id === connectionId) &&
      (modelId ? connection.eligibleModels.includes(modelId) : connection.eligibleModels.length > 0)
    );
    connectionId = selected?.id;
    modelId = modelId ?? selected?.eligibleModels[0];
  }
  if (!connectionId || !modelId) {
    return invalidChat(ctx, 'Select an eligible model from an active provider connection.', 'model');
  }

  const sessionId = input.sessionId ?? (await registry.runService.createSession({}, ctx)).id;
  const submission = { ...input, sessionId, connectionId, modelId };
  const previous = await registry.runService.getRunBySubmission(submission, ctx);
  if (previous) return replayChatRun(previous);

  const connection = await registry.connectionStore.getConnection(connectionId, ctx);
  if (!connection) {
    throw new GatewayError({ code: 'not_found', message: 'Provider connection was not found.', requestId: ctx.requestId });
  }
  if (connection.status !== 'active' || !connection.eligibleModels.includes(modelId)) {
    return invalidChat(ctx, 'The selected model is unavailable on this connection.', 'model');
  }

  const secret = connection.secretRef
    ? await registry.secretStore.getSecret(connection.secretRef, ctx)
    : null;
  if (connection.secretRef && !secret) {
    throw new GatewayError({ code: 'conflict', message: 'Provider credentials changed. Refresh the connection and try again.', requestId: ctx.requestId });
  }
  const price = gatewayModelPrice(connection, modelId, ctx);

  const { run, created } = await registry.runService.beginRun(submission, ctx);
  if (!created) return replayChatRun(run);

  const messageId = `assistant_${run.id}`;
  const startedAt = Date.now();
  const attemptId = randomUUID();
  const reservationId = randomUUID();
  const timeout = AbortSignal.timeout(55_000);
  const outputLimit = new AbortController();
  const runSignal = registry.runService.getRunSignal(run.id, ctx);
  const signal = AbortSignal.any([runSignal, timeout, outputLimit.signal]);
  let networkDispatched = false;
  let reserved = false;
  let outputLength = 0;
  let finishing: Promise<void> | undefined;

  function finish(
    status: 'completed' | 'failed' | 'cancelled',
    details?: { text?: string; error?: GatewayError; usage?: LanguageModelUsage }
  ) {
    finishing ??= (async () => {
      if (reserved) {
        const tokens = reportedTokens(details?.usage);
        await registry.usageService.settleAttempt({
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
      const message: UIMessage | undefined = details?.text
        ? {
            id: messageId,
            role: 'assistant',
            content: details.text,
            parts: [{ type: 'text', text: details.text }],
          }
        : undefined;
      await registry.runService.finishRun(run.id, { status, message, error: details?.error?.toEnvelope() }, ctx);
    })();
    return finishing;
  }
  const finishError = (error: unknown) => runSignal.aborted
    ? finish('cancelled')
    : finish('failed', { error: providerError(error, ctx, timeout.aborted) });

  try {
    const snapshot = await registry.runService.getSnapshot(sessionId, ctx);
    const messages: ModelMessage[] = snapshot.messages.flatMap((message): ModelMessage[] =>
      message.content && (message.role === 'user' || message.role === 'assistant')
        ? [{ role: message.role, content: message.content }]
        : []
    );
    let estimatedInputTokens = 32 + Buffer.byteLength(input.system ?? '');
    for (const message of snapshot.messages) {
      estimatedInputTokens += 16 + Buffer.byteLength(message.content);
    }
    reserved = await registry.usageService.reserveAttempt({
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

    const result = registry.inferenceAdapter.streamChat({
      modelId,
      messages,
      system: input.system,
      temperature: input.temperature,
      maxTokens: input.maxTokens,
      signal,
      onDispatch: () => { networkDispatched = true; },
      onText: async (delta) => {
        outputLength += delta.length;
        if (outputLength > MAX_ASSISTANT_TEXT_LENGTH) {
          outputLimit.abort();
          return finishError(outputLimit.signal.reason);
        }
        await registry.runService.appendAssistantDelta(run.id, messageId, delta, ctx);
      },
      onComplete: async ({ text, usage, finishReason }) => {
        if (signal.aborted || finishReason === 'error') {
          await finishError(signal.reason);
          return;
        }
        await finish('completed', { text, usage });
      },
      onError: finishError,
      onAbort: () => finishError(signal.reason),
    }, connection, secret ?? undefined);

    const response = result.toUIMessageStreamResponse({
      headers: chatStreamHeaders(run),
      generateMessageId: () => messageId,
      messageMetadata: ({ part }) => part.type === 'start' || part.type === 'finish'
        ? { runId: run.id, sessionId }
        : undefined,
      sendReasoning: false,
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
