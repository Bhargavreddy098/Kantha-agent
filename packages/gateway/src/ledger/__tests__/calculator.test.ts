import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calculateTurnCost } from "../calculator";
import type { TokenUsage } from "../../types/usage";
import type { ModelPricing } from "../../types/catalog";

describe("Token Cost Calculator", () => {
  it("calculates cost accurately with split cache write multipliers", () => {
    const pricing: ModelPricing = {
      input: 3.0, // $3.00 per 1M
      output: 15.0, // $15.00 per 1M
      cacheRead: 0.30, // $0.30 per 1M (0.1x)
      cacheWrite5m: 3.75, // $3.75 per 1M (1.25x)
      cacheWrite1h: 6.00, // $6.00 per 1M (2.0x)
    };

    const usage: TokenUsage = {
      inputTokens: 1_000_000, // $3.00
      outputTokens: 100_000, // $1.50
      reasoningTokens: 50_000, // included in outputTokens
      cacheReadTokens: 500_000, // $0.15
      cacheWrite5mTokens: 200_000, // $0.75
      cacheWrite1hTokens: 100_000, // $0.60
    };

    const cost = calculateTurnCost(usage, pricing);
    // Expected: 3.00 + 1.50 + 0.15 + 0.75 + 0.60 = 6.00
    assert.equal(Math.round(cost * 100) / 100, 6.00);
  });

  it("handles free models ($0 cost)", () => {
    const freePricing: ModelPricing = { input: 0, output: 0 };
    const usage: TokenUsage = {
      inputTokens: 50_000,
      outputTokens: 20_000,
      reasoningTokens: 0,
      cacheReadTokens: 0,
      cacheWrite5mTokens: 0,
      cacheWrite1hTokens: 0,
    };

    assert.equal(calculateTurnCost(usage, freePricing), 0);
  });
});
