import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ProviderRegistry, maskApiKey } from "../providerRegistry";

describe("ProviderRegistry Service", () => {
  it("should mask API keys correctly", () => {
    assert.equal(maskApiKey(""), "");
    assert.equal(maskApiKey("short"), "••••••••");
    assert.equal(maskApiKey("sk-proj-1234567890abcdef"), "sk-p••••cdef");
  });

  it("should initialize with built-in providers", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kantha-reg-test-"));
    const registry = new ProviderRegistry({ dataDir: tmpDir });

    const all = registry.getAll();
    const ids = all.map((p) => p.id);
    assert.ok(ids.includes("openai"), "should contain openai");
    assert.ok(ids.includes("anthropic"), "should contain anthropic");
    assert.ok(ids.includes("ollama"), "should contain ollama");
    assert.ok(ids.includes("groq"), "should contain groq");
    assert.ok(ids.includes("deepseek"), "should contain deepseek");
    assert.ok(ids.includes("openrouter"), "should contain openrouter");

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should sanitize providers and hide raw API keys from client payload", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kantha-reg-test-"));
    const registry = new ProviderRegistry({ dataDir: tmpDir });

    registry.upsertCustom({
      id: "custom_mistral",
      name: "Custom Mistral Endpoint",
      type: "openai_compatible",
      baseURL: "https://api.mistral.ai/v1",
      apiKey: "secret_mistral_api_key_12345678",
      headers: { Authorization: "Bearer secret_mistral_api_key_12345678", "X-Custom": "public-value" },
      models: [{ id: "mistral-large", name: "Mistral Large" }],
    });

    const sanitized = registry.getSanitized();
    const custom = sanitized.providers.find((p) => p.id === "custom_mistral");
    assert.ok(custom, "custom provider should exist");
    assert.equal(custom.name, "Custom Mistral Endpoint");
    assert.equal(custom.hasApiKey, true);
    assert.ok(custom.maskedApiKey?.includes("••••"), "key should be masked");
    assert.equal((custom as any).apiKey, undefined, "raw apiKey must not be present in sanitized output");
    assert.equal(custom.headers?.["Authorization"], "••••••••", "auth header must be masked");
    assert.equal(custom.headers?.["X-Custom"], "public-value", "public header should remain");

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should resolve provider and model for prefixed and unprefixed model requests", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kantha-reg-test-"));
    const registry = new ProviderRegistry({ dataDir: tmpDir });

    // Prefixed
    const resPrefixed = registry.getProviderForModel("anthropic:claude-3-7-sonnet");
    assert.ok(resPrefixed);
    assert.equal(resPrefixed.provider.id, "anthropic");
    assert.equal(resPrefixed.modelId, "claude-3-7-sonnet");

    // Unprefixed known Ollama model
    const resOllama = registry.getProviderForModel("deepseek-r1");
    assert.ok(resOllama);
    assert.equal(resOllama.provider.id, "ollama");
    assert.equal(resOllama.modelId, "deepseek-r1");

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should persist custom providers and default model across reloads", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kantha-reg-test-"));
    const registry1 = new ProviderRegistry({ dataDir: tmpDir });

    registry1.upsertCustom({
      id: "my_vllm",
      name: "My Local vLLM",
      type: "openai_compatible",
      baseURL: "http://localhost:8000/v1",
      models: [{ id: "qwen-coder", name: "Qwen 2.5 Coder 32B" }],
    });
    registry1.setDefaultModel("my_vllm:qwen-coder");

    // Reload from same dataDir
    const registry2 = new ProviderRegistry({ dataDir: tmpDir });
    assert.equal(registry2.getDefaultModel(), "my_vllm:qwen-coder");

    const custom = registry2.getAll().find((p) => p.id === "my_vllm");
    assert.ok(custom);
    assert.equal(custom.baseURL, "http://localhost:8000/v1");
    assert.equal(custom.models[0].id, "qwen-coder");

    // Test delete
    assert.equal(registry2.deleteCustom("my_vllm"), true);
    assert.equal(registry2.getAll().some((p) => p.id === "my_vllm"), false);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should resolve colon-containing model IDs to the correct provider without splitting error", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kantha-reg-test-"));
    const registry = new ProviderRegistry({ dataDir: tmpDir });
    registry.upsertCustom({
      id: "cent_ai",
      name: "Cent AI",
      type: "openai_compatible",
      baseURL: "https://api.cent-ai.dev/v1",
      models: [{ id: "hy4-flash:free", name: "HY4 Flash Free" }],
    });

    // Unprefixed colon-delimited model ID
    const res1 = registry.getProviderForModel("hy4-flash:free");
    assert.ok(res1, "should resolve unprefixed colon model");
    assert.equal(res1.provider.id, "cent_ai");
    assert.equal(res1.modelId, "hy4-flash:free");

    // Prefixed colon-delimited model ID (provider_id:model:id)
    const res2 = registry.getProviderForModel("cent_ai:hy4-flash:free");
    assert.ok(res2, "should resolve prefixed colon model");
    assert.equal(res2.provider.id, "cent_ai");
    assert.equal(res2.modelId, "hy4-flash:free");

    // Structured resolution with explicit providerId
    const res3 = registry.getProviderForModel("hy4-flash:free", "cent_ai");
    assert.ok(res3, "should resolve structured providerId and modelId");
    assert.equal(res3.provider.id, "cent_ai");
    assert.equal(res3.modelId, "hy4-flash:free");

    // Completely unknown model must return null and never fallback to OpenAI
    const unknown = registry.getProviderForModel("completely-unknown-model-xyz");
    assert.equal(unknown, null, "unknown model must return null and not fallback to OpenAI");

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should handle ambiguous model IDs across multiple providers safely", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kantha-reg-test-"));
    const registry = new ProviderRegistry({ dataDir: tmpDir });
    registry.upsertCustom({
      id: "provider_a",
      name: "Provider A",
      type: "openai_compatible",
      baseURL: "https://api.a.com/v1",
      models: [{ id: "shared-model-1", name: "Shared Model" }],
    });
    registry.upsertCustom({
      id: "provider_b",
      name: "Provider B",
      type: "openai_compatible",
      baseURL: "https://api.b.com/v1",
      models: [{ id: "shared-model-1", name: "Shared Model" }],
    });

    // With explicit provider, resolves cleanly
    const resA = registry.getProviderForModel("shared-model-1", "provider_a");
    assert.ok(resA);
    assert.equal(resA.provider.id, "provider_a");

    const resB = registry.getProviderForModel("shared-model-1", "provider_b");
    assert.ok(resB);
    assert.equal(resB.provider.id, "provider_b");

    // With provider prefix, resolves cleanly
    const resPrefixed = registry.getProviderForModel("provider_a:shared-model-1");
    assert.ok(resPrefixed);
    assert.equal(resPrefixed.provider.id, "provider_a");

    // Without explicit provider and ambiguous across providers, throws clear ambiguity error
    assert.throws(
      () => registry.getProviderForModel("shared-model-1"),
      /Ambiguous model 'shared-model-1'/
    );

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should persist and deduplicate multiple discovered models in custom provider", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kantha-reg-test-"));
    const registry = new ProviderRegistry({ dataDir: tmpDir });

    const models = [
      { id: "model-a", name: "Model A" },
      { id: "model-b:free", name: "Model B Free" },
      { id: "model-a", name: "Model A Duplicate" },
    ];

    registry.upsertCustom({
      id: "custom_multi",
      name: "Multi Provider",
      type: "openai_compatible",
      baseURL: "https://api.example.com/v1",
      models,
    });

    const saved = registry.getAll().find((p) => p.id === "custom_multi");
    assert.ok(saved);
    assert.equal(saved.models.length, 2, "duplicate models should be deduplicated");
    assert.equal(saved.models[0].id, "model-a");
    assert.equal(saved.models[1].id, "model-b:free");

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
