import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { RequestContext } from '../gateway/contracts/context';
import {
  HarnessError,
  type HarnessModelRequest,
  type HarnessModelResponse,
  type HarnessScope,
  type HarnessToolCall,
  type HarnessToolDefinition,
  type IHarnessInference,
} from './contracts';
import { estimateRequestTokens } from './tokens';

/**
 * Normalized provider stream. The gateway adapter converts its provider's
 * native stream into these chunks; the harness never parses vendor payloads.
 */
export type InferenceChunk =
  | { type: 'text'; text: string }
  | { type: 'tool_call_fragment'; id: string; name?: string; argumentsFragment: string }
  | { type: 'tool_call'; id: string; name: string; arguments: string }
  | { type: 'usage'; prompt?: number; completion?: number; total?: number; costUsd?: number }
  | { type: 'finish'; reason: 'stop' | 'tool_calls' | 'cancelled' };

export interface InferenceDispatchInput {
  runId: string;
  step: number;
  modelId: string;
  connectionId?: string;
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  tools: HarnessToolDefinition[];
  signal: AbortSignal;
  onDispatch: () => void;
}

export interface AttemptReservationInput {
  attemptId: string;
  reservationId: string;
  workspaceId: string;
  connectionId?: string;
  modelId: string;
  runId: string;
  status: 'reserved';
  estimatedTokens: number;
}

export interface AttemptSettlementInput {
  attemptId: string;
  reservationId: string;
  workspaceId: string;
  connectionId?: string;
  modelId: string;
  runId: string;
  status: 'settled' | 'refunded';
  tokens?: { prompt: number; completion: number; total: number };
  costUsd?: number;
}

/** Injected gateway accounting seam. Implemented by GatewayUsageService. */
export interface IAttemptLedger {
  reserve(input: AttemptReservationInput, ctx: RequestContext): Promise<boolean> | boolean;
  settle(input: AttemptSettlementInput, ctx: RequestContext): Promise<void> | void;
}

export type InferenceDispatcher = (
  input: InferenceDispatchInput,
  ctx: RequestContext,
) => AsyncIterable<InferenceChunk>;

const toolCallSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.number().int().nonnegative().optional(),
  arguments: z.record(z.string(), z.unknown()),
});

interface BufferedCall {
  id: string;
  name?: string;
  fragments: string[];
  completeArguments?: string;
}

function toRequestContext(scope: HarnessScope): RequestContext {
  return {
    requestId: scope.requestId,
    workspaceId: scope.workspaceId,
    caller: { type: 'user', id: scope.actorId },
    timestamp: Date.now(),
  };
}

function truncate(value: string, limit = 512): string {
  return value.length > limit ? `${value.slice(0, limit)}…` : value;
}

/**
 * Gateway-mediated inference for H2. Every physical provider attempt is
 * reserved before dispatch and settled exactly once on success, cancellation,
 * error or unknown usage. Streamed tool-argument fragments are buffered until
 * a complete call arrives; partial calls are never emitted downstream.
 */
export class GatewayInference implements IHarnessInference {
  constructor(private readonly services: {
    ledger: IAttemptLedger;
    dispatch: InferenceDispatcher;
    connectionId?: string;
    maxAttempts?: number;
  }) {}

  async complete(request: HarnessModelRequest, scope: HarnessScope): Promise<HarnessModelResponse> {
    const ctx = toRequestContext(scope);
    const messages = this.buildMessages(request);
    const estimatedTokens = estimateRequestTokens({
      task: request.task,
      history: request.history,
      tools: request.tools,
    });
    const maxAttempts = Math.max(1, this.services.maxAttempts ?? 2);

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const attemptId = `attempt_${request.runId}_${request.step}_${attempt}_${randomUUID().slice(0, 8)}`;
      const reservationId = randomUUID();
      const reserved = await this.services.ledger.reserve({
        attemptId,
        reservationId,
        workspaceId: scope.workspaceId,
        connectionId: this.services.connectionId,
        modelId: request.modelId,
        runId: request.runId,
        status: 'reserved',
        estimatedTokens,
      }, ctx);

      // Budget refusal: no upstream dispatch at all.
      if (!reserved) {
        throw new HarnessError('budget_denied', 'Inference budget denied before dispatch.');
      }

      const controller = new AbortController();
      const abort = () => controller.abort();
      request.signal?.addEventListener('abort', abort, { once: true });
      let settled = false;
      let networkDispatched = false;
      let sawOutput = false;
      let usage: AttemptSettlementInput['tokens'] | undefined;
      let costUsd: number | undefined;

      const settle = async (status: 'settled' | 'refunded') => {
        if (settled) return;
        settled = true;
        await this.services.ledger.settle({
          attemptId,
          reservationId,
          workspaceId: scope.workspaceId,
          connectionId: this.services.connectionId,
          modelId: request.modelId,
          runId: request.runId,
          status,
          ...(usage ? { tokens: usage } : {}),
          ...(costUsd !== undefined ? { costUsd } : {}),
        }, ctx);
      };

      try {
        const buffered = new Map<string, BufferedCall>();
        const completeCalls: HarnessToolCall[] = [];
        const textParts: string[] = [];
        let finishReason: HarnessModelResponse['finishReason'] = 'stop';

        const stream = this.services.dispatch({
          runId: request.runId,
          step: request.step,
          modelId: request.modelId,
          connectionId: this.services.connectionId,
          messages,
          tools: request.tools,
          signal: controller.signal,
          onDispatch: () => { networkDispatched = true; },
        }, ctx);

        for await (const chunk of stream) {
          if (controller.signal.aborted) break;
          if (chunk.type === 'text') {
            sawOutput = true;
            // Batch adjacent text chunks into one part before persistence.
            textParts.push(chunk.text);
          } else if (chunk.type === 'tool_call_fragment') {
            sawOutput = true;
            const current = buffered.get(chunk.id) ?? { id: chunk.id, fragments: [] };
            if (chunk.name) current.name = chunk.name;
            current.fragments.push(chunk.argumentsFragment);
            buffered.set(chunk.id, current);
          } else if (chunk.type === 'tool_call') {
            sawOutput = true;
            const current = buffered.get(chunk.id) ?? { id: chunk.id, fragments: [] };
            current.name = chunk.name;
            current.completeArguments = chunk.arguments;
            const raw = [...current.fragments, chunk.arguments].join('');
            const parsed = this.parseArguments(raw, chunk.name);
            const validated = toolCallSchema.safeParse({
              id: chunk.id,
              name: chunk.name,
              arguments: parsed,
            });
            if (!validated.success) {
              throw new HarnessError('invalid_tool_call', `Invalid tool call ${chunk.id}: ${truncate(validated.error.message)}`);
            }
            completeCalls.push(validated.data);
            buffered.delete(chunk.id);
          } else if (chunk.type === 'usage') {
            const total = chunk.total ??
              (chunk.prompt !== undefined && chunk.completion !== undefined
                ? chunk.prompt + chunk.completion
                : undefined);
            if (total !== undefined) {
              usage = {
                prompt: chunk.prompt ?? 0,
                completion: chunk.completion ?? 0,
                total,
              };
            }
            costUsd = chunk.costUsd;
          } else if (chunk.type === 'finish') {
            finishReason = chunk.reason;
          }
        }

        // Adjacent text chunks are persisted as one delta by the runner.
        const text = textParts.join('');
        const cancelled = controller.signal.aborted || finishReason === 'cancelled';
        const reason = completeCalls.length > 0 ? 'tool_calls' : finishReason;

        // Settle once when the upstream actually began. Unknown usage is left
        // absent so the ledger reports freshness 'estimated' rather than lying.
        await settle(networkDispatched && !cancelled ? 'settled' : 'refunded');

        return {
          attemptId,
          text,
          toolCalls: completeCalls,
          finishReason: cancelled ? 'cancelled' : reason,
        };
      } catch (error) {
        await settle(networkDispatched ? 'settled' : 'refunded');
        const transient = !sawOutput && attempt + 1 < maxAttempts &&
          !(error instanceof HarnessError && error.code === 'budget_denied');
        if (transient) continue;
        if (error instanceof HarnessError) throw error;
        throw new HarnessError('unresolved', `Inference attempt failed: ${truncate(error instanceof Error ? error.message : String(error))}`);
      } finally {
        request.signal?.removeEventListener('abort', abort);
        await settle('refunded');
      }
    }

    throw new HarnessError('unresolved', 'Inference exhausted all attempts.');
  }

  private buildMessages(request: HarnessModelRequest) {
    const messages: InferenceDispatchInput['messages'] = [
      { role: 'system', content: 'You are a coding assistant. Use the declared tools and return complete tool calls.' },
    ];
    request.history.forEach((entry, index) => {
      messages.push({ role: index % 2 === 0 ? 'user' : 'assistant', content: entry });
    });
    messages.push({ role: 'user', content: request.task });
    return messages;
  }

  private parseArguments(raw: string, toolName: string): Record<string, unknown> {
    if (!raw.trim()) return {};
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return { value: parsed };
    } catch {
      throw new HarnessError('invalid_tool_call', `Tool ${toolName} produced malformed JSON arguments.`);
    }
  }
}
