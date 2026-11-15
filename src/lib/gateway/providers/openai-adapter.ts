import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';
import type { IInferenceAdapter, ProviderChatInput } from '../contracts/adapters';
import type { GatewayConnection, TestConnectionResult } from '../contracts/connection';
import { makeProviderFetch, normalizeProviderEndpoint } from './egress';

export class OpenAIInferenceAdapter implements IInferenceAdapter {
  public async testConnection(
    connection: GatewayConnection,
    secret?: string
  ): Promise<TestConnectionResult> {
    const startedAt = Date.now();
    const result = (success: boolean, message: string, modelsCount?: number): TestConnectionResult => ({
      success,
      message,
      modelsCount,
      latencyMs: Date.now() - startedAt,
      testedAt: new Date().toISOString(),
    });

    try {
      const endpoint = normalizeProviderEndpoint(connection.endpoint);
      const fetchProvider = makeProviderFetch(endpoint);
      const response = await fetchProvider(`${endpoint}/models`, {
        headers: {
          accept: 'application/json',
          ...(secret ? { authorization: `Bearer ${secret}` } : {}),
        },
        signal: AbortSignal.timeout(8_000),
      });

      if (!response.ok) {
        await response.body?.cancel();
        if (response.status === 401 || response.status === 403) {
          return result(false, 'Provider rejected the configured credentials.');
        }
        if (response.status === 429) {
          return result(false, 'Provider is rate-limiting connection checks.');
        }
        return result(false, `Provider returned HTTP ${response.status}.`);
      }

      const payload: unknown = await response.json();
      const lists = payload && typeof payload === 'object' && !Array.isArray(payload)
        ? payload as { data?: unknown; models?: unknown }
        : null;
      const models = Array.isArray(lists?.data)
        ? lists.data
        : Array.isArray(lists?.models)
          ? lists.models
          : payload;
      if (!Array.isArray(models)) {
        return result(false, 'Provider returned an unrecognized model catalog.');
      }

      return result(true, 'Connected to the provider.', models.length);
    } catch (error) {
      if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
        return result(false, 'Provider connection timed out.');
      }
      return result(false, 'Could not verify the provider connection.');
    }
  }

  public streamChat(input: ProviderChatInput, connection: GatewayConnection, secret?: string) {
    const endpoint = normalizeProviderEndpoint(connection.endpoint);
    const fetchProvider = makeProviderFetch(endpoint);
    const client = createOpenAI({
      baseURL: endpoint,
      apiKey: secret ?? '',
      fetch: (url, init) => {
        input.signal.throwIfAborted();
        const headers = new Headers(init?.headers);
        if (!secret) headers.delete('authorization');
        input.onDispatch();
        return fetchProvider(url, { ...init, headers });
      },
    });

    return streamText({
      model: client.chat(input.modelId),
      messages: input.messages,
      system: input.system,
      temperature: input.temperature,
      maxOutputTokens: input.maxTokens,
      maxRetries: 0,
      abortSignal: input.signal,
      onChunk: ({ chunk }) => {
        if (chunk.type === 'text-delta') return input.onText(chunk.text);
      },
      onEnd: input.onComplete,
      onAbort: input.onAbort,
      onError: ({ error }) => input.onError(error),
    });
  }
}
