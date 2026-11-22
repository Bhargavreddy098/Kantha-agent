export type ProviderType =
  | "openai"
  | "anthropic"
  | "gemini"
  | "ollama"
  | "openai_compatible"
  | "anthropic_compatible";

export interface ProviderQuirks {
  readonly reasoningField?: string;
  readonly requireReasoning?: boolean;
  readonly maxTokensField?: "max_tokens" | "max_completion_tokens";
  readonly cacheFormat?: "anthropic" | "alibaba";
  readonly encoding?: "none" | "gzip" | "zstd";
  readonly streamUsage?: boolean;
}

export interface ProviderConfig {
  readonly id: string;
  readonly name: string;
  readonly type: ProviderType;
  readonly baseURL?: string;
  readonly apiKey?: string;
  readonly headers?: Record<string, string>;
  readonly isLocal?: boolean;
  readonly allowPrivateNetwork?: boolean;
  readonly compatibility?: ProviderQuirks;
  readonly models: Array<{
    readonly id: string;
    readonly name?: string;
    readonly tier?: number;
    readonly capabilities?: Record<string, unknown>;
  }>;
}
