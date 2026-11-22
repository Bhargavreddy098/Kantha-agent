import type http from "node:http";
import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { ProviderRegistry, ProviderConfig } from "../services/providerRegistry";

export type AiStreamMessages = NonNullable<Parameters<typeof streamText>[0]["messages"]>;

export interface ChatMessagePayload {
  role: string;
  content: string | Array<any>;
  reasoning?: string;
  [key: string]: any;
}

export interface StreamDelta {
  content: string;
  reasoning: string;
}

export const MAX_DOCUMENT_CHAR_LENGTH = 30_000;

/**
 * Sanitizes and maps incoming conversation messages into Vercel AI SDK CoreMessage format:
 * 1. Limits conversation to the last 20 messages (sliding window).
 * 2. Truncates oversized document text content to 30,000 characters.
 * 3. Formats vision image parts into `{ type: 'image', image: dataUrl }`.
 * 4. Strips prior assistant reasoning blocks to prevent upstream provider errors.
 */
export function convertToCoreMessages(
  messages: ChatMessagePayload[]
): AiStreamMessages {
  const windowed = messages.slice(-20);

  return windowed.map((msg): any => {
    const rawContent = msg.content;

    if (msg.role === "assistant") {
      const textContent = typeof rawContent === "string" ? rawContent : "";
      return {
        role: "assistant",
        content: textContent,
      };
    }

    if (msg.role === "system") {
      const textContent = typeof rawContent === "string" ? rawContent : "";
      return {
        role: "system",
        content: textContent,
      };
    }

    // Default to user role
    if (typeof rawContent === "string") {
      let text = rawContent;
      if (text.length > MAX_DOCUMENT_CHAR_LENGTH) {
        text =
          text.slice(0, MAX_DOCUMENT_CHAR_LENGTH) +
          `\n\n[Document truncated to first ${MAX_DOCUMENT_CHAR_LENGTH.toLocaleString()} characters]`;
      }
      return {
        role: "user",
        content: text,
      };
    }

    if (Array.isArray(rawContent)) {
      const parts: any[] = [];
      for (const part of rawContent) {
        if (part.type === "text" && typeof part.text === "string") {
          let text = part.text;
          if (text.length > MAX_DOCUMENT_CHAR_LENGTH) {
            text =
              text.slice(0, MAX_DOCUMENT_CHAR_LENGTH) +
              `\n\n[Document truncated to first ${MAX_DOCUMENT_CHAR_LENGTH.toLocaleString()} characters]`;
          }
          parts.push({ type: "text", text });
        } else if (part.type === "image_url" && part.image_url?.url) {
          parts.push({ type: "image", image: part.image_url.url });
        } else if (part.type === "image" && part.image) {
          parts.push({ type: "image", image: part.image });
        }
      }
      return {
        role: "user",
        content: parts.length > 0 ? parts : "",
      };
    }

    return {
      role: "user",
      content: String(rawContent || ""),
    };
  });
}

/**
 * Backward compatibility helper for existing sanitize tests.
 */
export function sanitizeMessagesForUpstream(
  messages: ChatMessagePayload[]
): Array<{ role: string; content: string | Array<any> }> {
  const core = convertToCoreMessages(messages);
  return core.map((m) => ({ role: m.role, content: m.content as any }));
}

/**
 * Normalizes OpenAI-compatible delta payloads (kept for test compatibility).
 */
export function parseOpenAiDelta(chunk: any): StreamDelta {
  const delta = chunk?.choices?.[0]?.delta || {};
  const content = typeof delta.content === "string" ? delta.content : "";
  const reasoning =
    typeof delta.reasoning_content === "string"
      ? delta.reasoning_content
      : typeof delta.thinking === "string"
      ? delta.thinking
      : "";

  return { content, reasoning };
}

/**
 * Formats an SSE event payload.
 */
export function formatSseEvent(
  data: string | { content: string; reasoning: string }
): string {
  const serialized = typeof data === "string" ? data : JSON.stringify(data);
  return `data: ${serialized}\n\n`;
}

/**
 * Factory creating a LanguageModel instance based on provider type and configuration.
 */
export function createLanguageModel(provider: ProviderConfig, modelId: string): any {
  const baseURL = provider.baseURL?.replace(/\/+$/, "");
  const headers = provider.headers;

  if (provider.type === "anthropic") {
    const anthropic = createAnthropic({
      apiKey: provider.apiKey,
      baseURL,
      headers,
    });
    return anthropic(modelId);
  }

  if (provider.type === "openai") {
    const openai = createOpenAI({
      apiKey: provider.apiKey,
      baseURL,
      headers,
    });
    return openai(modelId);
  }

  // Ollama or OpenAI-compatible (Groq, DeepSeek, OpenRouter, Custom)
  const compatible = createOpenAICompatible({
    name: provider.id,
    baseURL: baseURL || "http://127.0.0.1:11434/v1",
    apiKey: provider.apiKey,
    headers,
  });
  return compatible(modelId);
}

export interface ChatStreamContext {
  providerRegistry: ProviderRegistry;
}

/**
 * Handles incoming chat streaming requests over SSE via Vercel AI SDK.
 */
export async function handleChatStreamRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  context?: ChatStreamContext
): Promise<void> {
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });

  req.on("end", async () => {
    try {
      const payload = body ? JSON.parse(body) : {};
      const rawMessages: ChatMessagePayload[] = Array.isArray(payload.messages)
        ? payload.messages
        : [];

      if (rawMessages.length === 0) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing or empty messages array." }));
        return;
      }

      // Resolve provider from registry or fallback built-ins
      const registry = context?.providerRegistry;
      const explicitProviderId =
        typeof payload.providerId === "string" && payload.providerId.trim()
          ? payload.providerId.trim()
          : undefined;
      const requestedModel =
        typeof payload.model === "string" && payload.model.trim()
          ? payload.model.trim()
          : registry?.getDefaultModel() || "openai:gpt-4o";

      let resolution: { provider: ProviderConfig; modelId: string } | null = null;
      try {
        resolution = registry
          ? registry.getProviderForModel(requestedModel, explicitProviderId)
          : null;
      } catch (err: any) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
        return;
      }

      if (!resolution) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: `Unknown model or provider: '${requestedModel}'. Please check your configured providers in Settings.`,
          })
        );
        return;
      }

      const { provider, modelId } = resolution;

      if (!provider.configured && !provider.apiKey && provider.type !== "ollama") {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: `API key is not configured for provider '${provider.name}'. Please configure it in Settings.`,
          })
        );
        return;
      }

      const coreMessages = convertToCoreMessages(rawMessages);
      const abortController = new AbortController();
      let clientClosed = false;

      req.on("close", () => {
        clientClosed = true;
        abortController.abort();
      });

      const languageModel = createLanguageModel(provider, modelId);

      const result = streamText({
        model: languageModel,
        messages: coreMessages,
        maxRetries: 0,
        abortSignal: abortController.signal,
      });

      // Stream SSE headers
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });

      for await (const part of result.fullStream) {
        if (clientClosed) break;

        const partType = (part as any).type;
        if (partType === "text-delta") {
          const text = (part as any).text ?? (part as any).textDelta ?? "";
          if (text) {
            res.write(formatSseEvent({ content: text, reasoning: "" }));
          }
        } else if (partType === "reasoning-delta" || partType === "reasoning") {
          const text = (part as any).text ?? (part as any).textDelta ?? "";
          if (text) {
            res.write(formatSseEvent({ content: "", reasoning: text }));
          }
        } else if (partType === "error") {
          const errMsg = (part as any).error?.message || "Stream error";
          res.write(formatSseEvent({ content: `\n\n[Error: ${errMsg}]`, reasoning: "" }));
        }
      }

      if (!clientClosed) {
        res.write(formatSseEvent("[DONE]"));
        res.end();
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
        return;
      }
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message || "Internal streaming error" }));
      } else {
        res.write(formatSseEvent({ content: `\n\n[Error: ${err.message || "Internal streaming error"}]`, reasoning: "" }));
        res.end();
      }
    }
  });
}
