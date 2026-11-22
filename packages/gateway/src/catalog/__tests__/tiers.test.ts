import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { deriveModelTier } from "../tiers";
import type { ModelDefinition } from "../../types/catalog";

describe("Dynamic Intelligence Tier Derivation", () => {
  it("derives Tier 4 for free, local, or non-tool models", () => {
    const freeModel: ModelDefinition = {
      id: "ollama/llama3.2",
      providerId: "ollama",
      name: "Llama 3.2",
      tier: 4,
      capabilities: { tools: true, streaming: true },
      pricing: { input: 0, output: 0 },
    };

    const noToolModel: ModelDefinition = {
      id: "openai/text-davinci-003",
      providerId: "openai",
      name: "Davinci",
      tier: 4,
      capabilities: { tools: false },
      pricing: { input: 20, output: 20 },
    };

    assert.equal(deriveModelTier(freeModel), 4);
    assert.equal(deriveModelTier(noToolModel), 4);
  });

  it("derives Tier 3 for low-cost utility models even with reasoning & 128k context", () => {
    // Models like Flash, Haiku, GPT-4o-mini have reasoning, tools, and 128k+ context,
    // but cost < $0.50/1M input, so they must be Tier 3 (Utility).
    const flashModel: ModelDefinition = {
      id: "google/gemini-2.0-flash",
      providerId: "google",
      name: "Gemini 2.0 Flash",
      tier: 3,
      capabilities: {
        tools: true,
        reasoning: { supported: true },
        contextLimit: 1_000_000,
      },
      pricing: { input: 0.10, output: 0.40 },
    };

    const haikuModel: ModelDefinition = {
      id: "anthropic/claude-3-5-haiku",
      providerId: "anthropic",
      name: "Claude 3.5 Haiku",
      tier: 3,
      capabilities: {
        tools: true,
        reasoning: { supported: false },
        contextLimit: 200_000,
      },
      pricing: { input: 0.25, output: 1.25 },
    };

    assert.equal(deriveModelTier(flashModel), 3);
    assert.equal(deriveModelTier(haikuModel), 3);
  });

  it("derives Tier 1 for frontier paid models with strong reasoning and tools", () => {
    const sonnetThinking: ModelDefinition = {
      id: "anthropic/claude-3-7-sonnet",
      providerId: "anthropic",
      name: "Claude 3.7 Sonnet (Thinking)",
      tier: 1,
      capabilities: {
        tools: true,
        reasoning: { supported: true, effort: ["low", "medium", "high"] },
        contextLimit: 200_000,
      },
      pricing: { input: 3.00, output: 15.00 },
    };

    const gpt4o: ModelDefinition = {
      id: "openai/gpt-4o",
      providerId: "openai",
      name: "GPT-4o",
      tier: 1,
      capabilities: {
        tools: true,
        reasoning: { supported: true },
        contextLimit: 128_000,
      },
      pricing: { input: 2.50, output: 10.00 },
    };

    assert.equal(deriveModelTier(sonnetThinking), 1);
    assert.equal(deriveModelTier(gpt4o), 1);
  });

  it("derives Tier 2 for general purpose paid coding models without frontier price", () => {
    const coderModel: ModelDefinition = {
      id: "deepseek/deepseek-chat",
      providerId: "deepseek",
      name: "DeepSeek V3",
      tier: 2,
      capabilities: {
        tools: true,
        reasoning: { supported: false },
        contextLimit: 64_000,
      },
      pricing: { input: 0.95, output: 2.50 },
    };

    assert.equal(deriveModelTier(coderModel), 2);
  });
});
