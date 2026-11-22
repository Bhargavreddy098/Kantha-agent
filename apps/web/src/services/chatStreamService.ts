import type { StoredMessage } from "../db/chatDb";

export interface StreamChatOptions {
  messages: StoredMessage[];
  model?: string;
  onToken: (delta: string) => void;
  onReasoning: (delta: string) => void;
  onError: (error: Error) => void;
  onComplete: () => void;
  signal?: AbortSignal;
}

/**
 * Formats client stored messages into the OpenAI /chat/completions payload format.
 * - Injects extracted text from documents into the user message content.
 * - Formats images as OpenAI vision image_url objects when present.
 * - Omits historical reasoning blocks from assistant turns to prevent upstream API rejection.
 */
function formatMessagesForPayload(messages: StoredMessage[]) {
  return messages.map((msg) => {
    if (msg.role === "assistant") {
      return {
        role: "assistant",
        content: msg.content || "",
      };
    }

    if (msg.role === "user") {
      let textContent = msg.content || "";

      // Append extracted document context if present
      if (msg.attachments && msg.attachments.length > 0) {
        for (const att of msg.attachments) {
          if (att.extractedText) {
            textContent += `\n\n--- Document: ${att.name} ---\n${att.extractedText}`;
          }
        }
      }

      // Check for image attachments for vision multimodal format
      const imageAttachments = msg.attachments?.filter((a) => Boolean(a.dataUrl)) || [];

      if (imageAttachments.length > 0) {
        const parts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
        if (textContent) {
          parts.push({ type: "text", text: textContent });
        }
        for (const img of imageAttachments) {
          if (img.dataUrl) {
            parts.push({
              type: "image_url",
              image_url: { url: img.dataUrl },
            });
          }
        }
        return {
          role: "user",
          content: parts,
        };
      }

      return {
        role: "user",
        content: textContent,
      };
    }

    return {
      role: msg.role,
      content: msg.content,
    };
  });
}

/**
 * Streams real-time AI response from Bun daemon SSE endpoint.
 */
export async function streamChatResponse(options: StreamChatOptions): Promise<void> {
  const { messages, model, onToken, onReasoning, onError, onComplete, signal } = options;

  try {
    const payloadMessages = formatMessagesForPayload(messages);

    const response = await fetch("/api/chat/stream", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: payloadMessages,
        model,
      }),
      signal,
    });

    if (!response.ok) {
      const errorJson = await response.json().catch(() => ({}));
      throw new Error(errorJson.error || `Streaming failed with status ${response.status}`);
    }

    if (!response.body) {
      onComplete();
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      if (signal?.aborted) {
        break;
      }

      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;

        const dataStr = trimmed.replace(/^data:\s*/, "");
        if (dataStr === "[DONE]") {
          onComplete();
          return;
        }

        try {
          const parsed = JSON.parse(dataStr);
          if (parsed.reasoning) {
            onReasoning(parsed.reasoning);
          }
          if (parsed.content) {
            onToken(parsed.content);
          }
        } catch {
          // ignore heartbeats or partial chunks
        }
      }
    }

    onComplete();
  } catch (err: any) {
    if (err.name === "AbortError") {
      onComplete();
      return;
    }
    onError(err);
  }
}
