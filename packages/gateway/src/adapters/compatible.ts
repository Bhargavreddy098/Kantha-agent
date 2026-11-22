import type { ProviderQuirks } from "../types/provider";

export interface ParsedOpenAiDelta {
  content: string;
  reasoning: string;
}

export function parseOpenAiCompatibleChunk(chunk: any, quirks: ProviderQuirks = {}): ParsedOpenAiDelta {
  const delta = chunk?.choices?.[0]?.delta || {};
  const content = typeof delta.content === "string" ? delta.content : "";

  let reasoning = "";
  if (quirks.reasoningField && typeof delta[quirks.reasoningField] === "string") {
    reasoning = delta[quirks.reasoningField];
  } else if (typeof delta.reasoning_content === "string") {
    reasoning = delta.reasoning_content;
  } else if (typeof delta.thinking === "string") {
    reasoning = delta.thinking;
  }

  return { content, reasoning };
}
