/**
 * Gateway Usage & Budget Contracts
 * Route endpoints:
 *   GET /api/gateway/usage
 *   POST /api/gateway/usage/attempt/reserve
 *   POST /api/gateway/usage/attempt/settle
 */

export type UsageFreshness = 'fresh' | 'stale' | 'estimated';

export interface TokenTotals {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd?: number;
  totalRequests: number;
}

export interface BudgetLimits {
  maxDailyTokens?: number;
  maxDailyBudgetUsd?: number;
  currentTokensUsed: number;
  currentBudgetUsdUsed: number;
  isExceeded: boolean;
}

export interface ModelUsageSummary {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  requests: number;
  estimatedCostUsd?: number;
}

export interface GatewayUsageSummary {
  workspaceId: string;
  window: {
    start: string;
    end: string;
  };
  freshness: UsageFreshness;
  totals: TokenTotals;
  limits?: BudgetLimits;
  byModel: Record<string, ModelUsageSummary>;
  lastUpdatedAt: string;
}

export interface AttemptAccounting {
  attemptId: string;
  reservationId: string;
  workspaceId: string;
  runId?: string;
  connectionId: string;
  modelId: string;
  status: 'reserved' | 'settled' | 'denied' | 'refunded';
  tokens?: {
    prompt: number;
    completion: number;
    total: number;
  };
  durationMs: number;
  costUsd?: number;
  settledAt?: string;
}
