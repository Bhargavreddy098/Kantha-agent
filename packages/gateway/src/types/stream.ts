import type { KanthaReasoningBlock, KanthaToolCall } from "./request";
import type { TokenUsage } from "./usage";

export interface StreamDelta {
  readonly text?: string;
  readonly reasonings?: KanthaReasoningBlock[];
  readonly toolCalls?: KanthaToolCall[];
  readonly usage?: TokenUsage;
  readonly finishReason?: "stop" | "tool_calls" | "length" | "interrupted" | "error";
}

export interface InferenceResponse {
  readonly text: string;
  readonly reasonings?: KanthaReasoningBlock[];
  readonly toolCalls?: KanthaToolCall[];
  readonly usage: TokenUsage;
  readonly finishReason: "stop" | "tool_calls" | "length" | "interrupted" | "error";
}
