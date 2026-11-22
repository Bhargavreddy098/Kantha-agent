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
});
