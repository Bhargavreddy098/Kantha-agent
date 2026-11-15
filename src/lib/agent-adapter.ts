import type { UIMessage } from "ai";
import type { AgentMessage, AgentPart } from "@/types/agent-chat";

/**
 * Maps Vercel AI SDK UIMessage into the canonical AgentMessage format.
 * Chronologically parses reasoning (<think> / <thought>) and text parts.
 */
export function mapUIMessageToAgentMessage(
  msg: UIMessage,
  isStreaming?: boolean
): AgentMessage {
  const parts: AgentPart[] = [];

  if (Array.isArray(msg.parts) && msg.parts.length > 0) {
    for (let i = 0; i < msg.parts.length; i++) {
      const part = msg.parts[i] as Record<string, unknown>;
      const partType = (part.type as string) || "text";

      if (partType === "text" && typeof part.text === "string") {
        const raw = part.text;

        // Match <think>...</think> or <thought>...</thought>
        const thinkMatch = raw.match(/<(think|thought)>([\s\S]*?)<\/\1>/i);

        if (thinkMatch) {
          const reasoningText = thinkMatch[2].trim();
          const remainingText = raw.replace(/<(think|thought)>[\s\S]*?<\/\1>/gi, "").trim();

          if (reasoningText) {
            parts.push({
              type: "reasoning",
              id: `${msg.id}-reasoning-${i}`,
              text: reasoningText,
              isStreaming: Boolean(isStreaming && !remainingText),
            });
          }
          if (remainingText) {
            parts.push({
              type: "text",
              id: `${msg.id}-text-${i}`,
              text: remainingText,
            });
          }
        } else if (/<(think|thought)>/i.test(raw) && !/<\/(think|thought)>/i.test(raw)) {
          // Streaming active thought block (opening tag present, closing tag not yet arrived)
          const reasoningText = raw.replace(/<(think|thought)>/i, "").trim();
          parts.push({
            type: "reasoning",
            id: `${msg.id}-reasoning-${i}`,
            text: reasoningText || "Thinking through the response...",
            isStreaming: true,
          });
        } else {
          parts.push({
            type: "text",
            id: `${msg.id}-text-${i}`,
            text: raw,
          });
        }
      } else if (partType === "reasoning" || partType === "thought") {
        const text = (part.text || part.reasoning || "") as string;
        parts.push({
          type: "reasoning",
          id: `${msg.id}-reasoning-${i}`,
          text,
          isStreaming: Boolean(isStreaming && (part.isStreaming ?? false)),
        });
      }
    }
  }

  // Fallback if parts was empty or omitted
  if (parts.length === 0 && typeof (msg as unknown as { content?: string }).content === "string") {
    const raw = (msg as unknown as { content: string }).content;
    const thinkMatch = raw.match(/<(think|thought)>([\s\S]*?)<\/\1>/i);
    if (thinkMatch) {
      const reasoningText = thinkMatch[2].trim();
      const remainingText = raw.replace(/<(think|thought)>[\s\S]*?<\/\1>/gi, "").trim();
      if (reasoningText) {
        parts.push({
          type: "reasoning",
          id: `${msg.id}-reasoning`,
          text: reasoningText,
          isStreaming: false,
        });
      }
      if (remainingText) {
        parts.push({
          type: "text",
          id: `${msg.id}-content`,
          text: remainingText,
        });
      }
    } else {
      parts.push({
        type: "text",
        id: `${msg.id}-content`,
        text: raw,
      });
    }
  }

  return {
    id: msg.id,
    role: msg.role as "user" | "assistant" | "system",
    createdAt: new Date(),
    parts,
  };
}
