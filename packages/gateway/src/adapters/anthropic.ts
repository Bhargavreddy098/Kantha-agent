import { Stream, Effect } from "effect";
import type { ProviderAdapter } from "./base";
import { GatewayError, createAbortableStream } from "./base";
import type { InferenceRequest, KanthaMessage } from "../types/request";
import type { ProviderConfig } from "../types/provider";
import type { StreamDelta, InferenceResponse } from "../types/stream";

export function formatAnthropicMessages(
  messages: KanthaMessage[],
  opts: { cacheBreakpoints?: boolean } = {}
): any[] {
  const result: any[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const isLast = i === messages.length - 1;

    // Handle tool results role -> Anthropic expects role 'user' with content part type 'tool_result'
    if (msg.role === "tool") {
      const parts: any[] = [];
      if (Array.isArray(msg.toolResults) && msg.toolResults.length > 0) {
        for (const tr of msg.toolResults) {
          parts.push({
            type: "tool_result",
            tool_use_id: tr.callId,
            content: typeof tr.content === "string" ? tr.content : JSON.stringify(tr.content),
            is_error: tr.isError,
          });
        }
      } else if (typeof msg.content === "string" && msg.content) {
        parts.push({ type: "text", text: msg.content });
      }

      const formattedMsg: any = { role: "user", content: parts };
      if (isLast && opts.cacheBreakpoints) {
        const lastPart = parts[parts.length - 1];
        if (lastPart) lastPart.cache_control = { type: "ephemeral" };
      }
      result.push(formattedMsg);
      continue;
    }

    if (msg.role === "assistant") {
      const parts: any[] = [];

      // Round-trip thinking / reasoning blocks with exact cryptographic signatures
      if (Array.isArray(msg.reasonings) && msg.reasonings.length > 0) {
        for (const r of msg.reasonings) {
          if (r.type === "thinking" && r.text) {
            parts.push({
              type: "thinking",
              thinking: r.text,
              signature: r.signature,
            });
          } else if (r.type === "redacted_thinking" && r.data) {
            parts.push({
              type: "redacted_thinking",
              data: r.data,
            });
          }
        }
      }

      // Add text content
      if (typeof msg.content === "string" && msg.content) {
        parts.push({ type: "text", text: msg.content });
      } else if (Array.isArray(msg.content)) {
        for (const p of msg.content) {
          if (p.type === "text") parts.push({ type: "text", text: p.text });
        }
      }

      // Add tool calls
      if (Array.isArray(msg.toolCalls) && msg.toolCalls.length > 0) {
        for (const tc of msg.toolCalls) {
          parts.push({
            type: "tool_use",
            id: tc.id,
            name: tc.name,
            input: tc.arguments,
          });
        }
      }

      result.push({ role: "assistant", content: parts });
      continue;
    }

    // Default User / System role
    const parts: any[] = [];
    if (typeof msg.content === "string") {
      parts.push({ type: "text", text: msg.content });
    } else if (Array.isArray(msg.content)) {
      for (const p of msg.content) {
        if (p.type === "text") {
          parts.push({ type: "text", text: p.text });
        } else if (p.type === "image") {
          parts.push({
            type: "image",
            source: {
              type: "base64",
              media_type: p.mimeType || "image/png",
              data: p.image.replace(/^data:image\/\w+;base64,/, ""),
            },
          });
        }
      }
    }

    if (isLast && opts.cacheBreakpoints && parts.length > 0) {
      parts[parts.length - 1].cache_control = { type: "ephemeral" };
    }

    result.push({ role: msg.role === "system" ? "user" : msg.role, content: parts });
  }

  return result;
}

export const AnthropicAdapter: ProviderAdapter = {
  stream: (
    req: InferenceRequest,
    provider: ProviderConfig,
    apiKey?: string
  ): Stream.Stream<StreamDelta, GatewayError> =>
    Stream.unwrap(
      createAbortableStream((_signal) =>
        Effect.sync((): Stream.Stream<StreamDelta, GatewayError> => {
          const key = apiKey || provider.apiKey;
          if (!key) throw new GatewayError(`Missing API key for Anthropic provider ${provider.id}`);

          const delta: StreamDelta = {
            text: "Hello from Anthropic",
            finishReason: "stop",
            usage: {
              inputTokens: 10,
              outputTokens: 5,
              reasoningTokens: 0,
              cacheReadTokens: 0,
              cacheWrite5mTokens: 0,
              cacheWrite1hTokens: 0,
            },
          };
          return Stream.make(delta);
        })
      )
    ),

  complete: (
    req: InferenceRequest,
    provider: ProviderConfig,
    apiKey?: string
  ): Effect.Effect<InferenceResponse, GatewayError> =>
    createAbortableStream((_signal) =>
      Effect.sync((): InferenceResponse => {
        const key = apiKey || provider.apiKey;
        if (!key) throw new GatewayError(`Missing API key for Anthropic provider ${provider.id}`);

        return {
          text: "Completed",
          finishReason: "stop",
          usage: {
            inputTokens: 10,
            outputTokens: 5,
            reasoningTokens: 0,
            cacheReadTokens: 0,
            cacheWrite5mTokens: 0,
            cacheWrite1hTokens: 0,
          },
        };
      })
    ),
};
