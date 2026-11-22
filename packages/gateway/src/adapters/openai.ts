import type { KanthaMessage } from "../types/request";

export function formatOpenAiMessages(messages: KanthaMessage[]): any[] {
  const result: any[] = [];

  for (const msg of messages) {
    if (msg.role === "tool") {
      if (Array.isArray(msg.toolResults) && msg.toolResults.length > 0) {
        for (const tr of msg.toolResults) {
          result.push({
            role: "tool",
            tool_call_id: tr.callId,
            content: typeof tr.content === "string" ? tr.content : JSON.stringify(tr.content),
          });
        }
      }
      continue;
    }

    if (msg.role === "assistant") {
      const toolCalls = msg.toolCalls?.map((tc) => ({
        id: tc.id,
        type: "function",
        function: {
          name: tc.name,
          arguments: JSON.stringify(tc.arguments),
        },
      }));

      result.push({
        role: "assistant",
        content: typeof msg.content === "string" ? msg.content : "",
        tool_calls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
      });
      continue;
    }

    // User / System
    result.push({
      role: msg.role,
      content: typeof msg.content === "string" ? msg.content : "",
    });
  }

  return result;
}
