import type { KanthaMessage } from "../types/request";

export function formatGeminiContents(messages: KanthaMessage[]): any[] {
  const contents: any[] = [];

  for (const msg of messages) {
    if (msg.role === "tool") {
      // Gemini expects role: 'function' with functionResponse containing toolName
      if (Array.isArray(msg.toolResults) && msg.toolResults.length > 0) {
        for (const tr of msg.toolResults) {
          contents.push({
            role: "function",
            parts: [
              {
                functionResponse: {
                  name: tr.toolName,
                  response: typeof tr.content === "object" && tr.content !== null ? tr.content : { output: tr.content },
                },
              },
            ],
          });
        }
      }
      continue;
    }

    const role = msg.role === "assistant" ? "model" : "user";
    const parts: any[] = [];

    if (typeof msg.content === "string" && msg.content) {
      parts.push({ text: msg.content });
    }

    if (msg.toolCalls && msg.toolCalls.length > 0) {
      for (const tc of msg.toolCalls) {
        parts.push({
          functionCall: {
            name: tc.name,
            args: tc.arguments,
          },
        });
      }
    }

    contents.push({ role, parts });
  }

  return contents;
}
