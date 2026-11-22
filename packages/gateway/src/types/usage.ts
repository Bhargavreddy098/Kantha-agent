export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly reasoningTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWrite5mTokens: number;
  readonly cacheWrite1hTokens: number;
}

export interface LedgerEntry {
  readonly id: string;
  readonly sessionId: string;
  readonly turnId?: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly reasoningTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWrite5mTokens: number;
  readonly cacheWrite1hTokens: number;
  readonly costUsd: number;
  readonly estimated: boolean;
  readonly status: "completed" | "interrupted" | "error";
  readonly timestamp: number;
}

export interface SessionUsageSummary {
  readonly sessionId: string;
  readonly totalInputTokens: number;
  readonly totalOutputTokens: number;
  readonly totalReasoningTokens: number;
  readonly totalCacheReadTokens: number;
  readonly totalCacheWriteTokens: number;
  readonly totalTokens: number;
  readonly totalCostUsd: number;
  readonly turnCount: number;
}
