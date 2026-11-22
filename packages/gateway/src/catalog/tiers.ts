import type { ModelDefinition, ModelTier } from "../types/catalog";

/**
 * Dynamically derives a model's intelligence tier based on capabilities and pricing.
 * Evaluation precedence:
 *   1. Tier 4: Free, unverified local, or models lacking tool capabilities.
 *   2. Tier 3: Low-cost utility models (input price < $0.50/1M tokens, e.g. Flash, Haiku, GPT-4o-mini).
 *   3. Tier 1: Frontier BYOK models (tools + strong reasoning + price >= $2.00/1M or flagship metadata).
 *   4. Tier 2: General purpose coding/planning BYOK models.
 */
export function deriveModelTier(model: ModelDefinition): ModelTier {
  const { capabilities, pricing } = model;

  // Step 1: Tier 4 (Free, local small, or no tool support)
  if (pricing.input === 0 || capabilities.tools === false) {
    return 4;
  }

  // Step 2: Tier 3 (Utility / fast / low-cost models under $0.50/1M input)
  if (pricing.input < 0.50) {
    return 3;
  }

  // Step 3: Tier 1 (Frontier BYOK: tools + strong reasoning + frontier price >= $2.00/1M or flagship)
  const hasReasoning = Boolean(capabilities.reasoning?.supported);
  const hasTools = capabilities.tools === true;
  const isFrontierPrice = pricing.input >= 2.00;
  const isFlagship =
    model.id.includes("claude-3-7") ||
    model.id.includes("claude-3-5-sonnet") ||
    model.id.includes("gpt-4o") ||
    model.id.includes("o3") ||
    model.id.includes("o1") ||
    model.id.includes("gemini-2.0-pro");

  if (hasTools && (hasReasoning || isFlagship) && (isFrontierPrice || isFlagship)) {
    return 1;
  }

  // Step 4: Tier 2 (General purpose coding models)
  return 2;
}
