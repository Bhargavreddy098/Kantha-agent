import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { GatewayConnection } from '../contracts/connection';
import { makeProviderFetch } from './egress';

export function gatewayLanguageModel(
  connection: GatewayConnection,
  modelId: string,
  secret: string | null,
  onDispatch: () => void,
) {
  const baseURL = connection.endpoint;
  const transport = makeProviderFetch(baseURL, onDispatch);
  if (connection.providerType === 'anthropic') {
    return createAnthropic({ baseURL, apiKey: secret ?? '', fetch: transport })(modelId);
  }
  if (connection.providerType === 'openai') {
    const fetchProvider: typeof fetch = (url, init) => {
      const headers = new Headers(init?.headers);
      if (!secret) headers.delete('authorization');
      return transport(url, { ...init, headers });
    };
    return createOpenAI({ baseURL, apiKey: secret ?? '', fetch: fetchProvider }).chat(modelId);
  }
  return createOpenAICompatible({
    name: connection.providerType,
    baseURL,
    apiKey: secret ?? undefined,
    fetch: transport,
    includeUsage: true,
  }).chatModel(modelId);
}
