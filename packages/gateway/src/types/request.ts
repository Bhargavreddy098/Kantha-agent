export interface KanthaReasoningBlock {
  readonly type: "thinking" | "redacted_thinking";
  readonly text?: string;
  readonly data?: string;
  readonly signature?: string;
  readonly providerMetadata?: Record<string, unknown>;
}

export interface KanthaToolCall {
  readonly id: string;
  readonly name: string;
  readonly arguments: Record<string, unknown>;
}

export interface KanthaToolResult {
  readonly callId: string;
  readonly toolName: string;
  readonly content: unknown;
  readonly isError?: boolean;
}

export type KanthaContentPart =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "image"; readonly image: string; readonly mimeType?: string }
  | { readonly type: "reasoning"; readonly reasoning: KanthaReasoningBlock };

export interface KanthaMessage {
  readonly role: "user" | "assistant" | "system" | "tool";
  readonly content: string | KanthaContentPart[];
  readonly reasonings?: KanthaReasoningBlock[];
  readonly toolCalls?: KanthaToolCall[];
  readonly toolResults?: KanthaToolResult[];
}

export interface KanthaTool {
  readonly name: string;
  readonly description?: string;
  readonly parameters: Record<string, unknown>;
}

export interface InferenceOptions {
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly reasoningEffort?: "low" | "medium" | "high";
  readonly cacheBreakpoints?: boolean;
}

export interface RequestAttribution {
  readonly sessionId?: string;
  readonly turnId?: string;
}

export interface InferenceRequest {
  readonly providerId: string;
  readonly modelId: string;
  readonly variant?: string;
  readonly messages: KanthaMessage[];
  readonly tools?: KanthaTool[];
  readonly options?: InferenceOptions;
  readonly attribution?: RequestAttribution;
}
