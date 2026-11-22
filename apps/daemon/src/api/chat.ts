import type http from "node:http";

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

const MAX_DOCUMENT_CHAR_LENGTH = 30_000;

/**
 * Sanitizes conversation history before dispatching to upstream OpenAI /chat/completions:
 * 1. Strips previous assistant reasoning blocks (which upstream APIs reject).
 * 2. Truncates oversized document contexts to 30,000 characters with an inline warning.
 */
export function sanitizeMessagesForUpstream(
  messages: ChatMessagePayload[]
): Array<{ role: string; content: string | Array<any> }> {
  // Apply 20-message sliding window to stay safely within token quotas
  const windowed = messages.slice(-20);

  return windowed.map((msg) => {
    let content = msg.content;

    if (typeof content === "string" && content.length > MAX_DOCUMENT_CHAR_LENGTH) {
      content =
        content.slice(0, MAX_DOCUMENT_CHAR_LENGTH) +
        `\n\n[Document truncated to first ${MAX_DOCUMENT_CHAR_LENGTH.toLocaleString()} characters]`;
    } else if (Array.isArray(content)) {
      content = content.map((part) => {
        if (
          part.type === "text" &&
          typeof part.text === "string" &&
          part.text.length > MAX_DOCUMENT_CHAR_LENGTH
        ) {
          return {
            ...part,
            text:
              part.text.slice(0, MAX_DOCUMENT_CHAR_LENGTH) +
              `\n\n[Document truncated to first ${MAX_DOCUMENT_CHAR_LENGTH.toLocaleString()} characters]`,
          };
        }
        return part;
      });
    }

    return {
      role: msg.role,
      content,
    };
  });
}

/**
 * Normalizes OpenAI-compatible delta payloads, supporting standard content,
 * OpenAI o1/o3/DeepSeek `reasoning_content`, and Anthropic-compatible `thinking`.
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
 * Handles incoming chat streaming requests over SSE with AbortController cancellation.
 */
export async function handleChatStreamRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  const openAiApiKey = process.env.OPENAI_API_KEY;
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  const openAiBaseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const ollamaBaseUrl = (process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434/v1").replace(/\/+$/, "");
  const defaultModel = process.env.OPENAI_MODEL || (openAiApiKey ? "gpt-4o" : "llama3.2");

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
      const requestedModel = (payload.model || defaultModel).trim();

      if (rawMessages.length === 0) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing or empty messages array." }));
        return;
      }

      // Determine upstream endpoint, model ID, and authorization
      let upstreamUrl = `${openAiBaseUrl}/chat/completions`;
      let targetApiKey = openAiApiKey;
      let targetModel = requestedModel;

      const isOllama =
        requestedModel.startsWith("ollama:") ||
        ["llama3.2", "deepseek-r1", "qwen2.5-coder"].includes(requestedModel);

      if (isOllama) {
        upstreamUrl = `${ollamaBaseUrl}/chat/completions`;
        targetApiKey = process.env.OLLAMA_API_KEY || "ollama";
        targetModel = requestedModel.replace(/^ollama:/, "");
      } else if (requestedModel.startsWith("anthropic:")) {
        targetModel = requestedModel.replace(/^anthropic:/, "");
        targetApiKey = anthropicApiKey || openAiApiKey;
      } else if (requestedModel.startsWith("openai:")) {
        targetModel = requestedModel.replace(/^openai:/, "");
      }

      if (!targetApiKey && !isOllama) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error:
              "API key is not configured for the requested model provider. Please configure OPENAI_API_KEY, ANTHROPIC_API_KEY, or switch to a local Ollama model in Settings.",
          })
        );
        return;
      }

      const sanitizedMessages = sanitizeMessagesForUpstream(rawMessages);

      const abortController = new AbortController();
      let clientClosed = false;

      req.on("close", () => {
        clientClosed = true;
        abortController.abort();
      });

      const upstreamResponse = await fetch(upstreamUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${targetApiKey}`,
        },
        body: JSON.stringify({
          model: targetModel,
          messages: sanitizedMessages,
          stream: true,
        }),
        signal: abortController.signal,
      });

      if (!upstreamResponse.ok) {
        const errorText = await upstreamResponse.text().catch(() => "");
        let errorMessage = `Upstream API returned status ${upstreamResponse.status}`;
        try {
          const parsed = JSON.parse(errorText);
          if (parsed.error?.message) {
            errorMessage = parsed.error.message;
          }
        } catch {
          // keep fallback error text
        }

        res.writeHead(upstreamResponse.status, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: errorMessage }));
        return;
      }

      // Stream SSE headers
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });

      if (!upstreamResponse.body) {
        res.write(formatSseEvent("[DONE]"));
        res.end();
        return;
      }

      const reader = upstreamResponse.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (!clientClosed) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data:")) continue;

          const dataPayload = trimmed.replace(/^data:\s*/, "");
          if (dataPayload === "[DONE]") {
            res.write(formatSseEvent("[DONE]"));
            continue;
          }

          try {
            const parsed = JSON.parse(dataPayload);
            const delta = parseOpenAiDelta(parsed);
            if (delta.content || delta.reasoning) {
              res.write(formatSseEvent(delta));
            }
          } catch {
            // Malformed chunk or keep-alive heartbeat
          }
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
        res.end();
      }
    }
  });
}
