import type { TokenUsage } from "../types/usage";
import type { ModelPricing } from "../types/catalog";

const ONE_MILLION = 1_000_000;

/**
 * Calculates authoritative USD cost for a turn based on token usage and model pricing per 1M tokens.
 */
export function calculateTurnCost(usage: TokenUsage, pricing: ModelPricing): number {
  if (pricing.input === 0 && pricing.output === 0) {
    return 0;
  }

  const inputCost = (usage.inputTokens * pricing.input) / ONE_MILLION;
  const outputCost = (usage.outputTokens * pricing.output) / ONE_MILLION;

  const cacheReadRate = pricing.cacheRead ?? pricing.input * 0.1;
  const cacheReadCost = (usage.cacheReadTokens * cacheReadRate) / ONE_MILLION;

  const cacheWrite5mRate = pricing.cacheWrite5m ?? pricing.input * 1.25;
  const cacheWrite5mCost = (usage.cacheWrite5mTokens * cacheWrite5mRate) / ONE_MILLION;

  const cacheWrite1hRate = pricing.cacheWrite1h ?? pricing.input * 2.0;
  const cacheWrite1hCost = (usage.cacheWrite1hTokens * cacheWrite1hRate) / ONE_MILLION;

  return inputCost + outputCost + cacheReadCost + cacheWrite5mCost + cacheWrite1hCost;
}
