import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createKanthaDb, gatewaySecrets, eq } from "@kantha/db";
import { createDaemonGatewayLayer } from "../../services/gateway";
import { ProviderRegistry } from "../../services/providerRegistry";

describe("ProviderRegistry Vault Integration & Crash-Safe Migration", () => {
  let tmpDir: string;
  let db: any;
  let gatewayLayer: any;

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `kantha-vault-reg-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
    fs.mkdirSync(tmpDir, { recursive: true });

    const dbPath = path.join(tmpDir, "kantha.sqlite");
    const dbResult = await createKanthaDb({ dbPath });
    db = dbResult.db;

    gatewayLayer = createDaemonGatewayLayer({ db, dataDir: tmpDir });
  });

  it("encrypts apiKey into gateway_secrets and scrubs plaintext from providers.json on upsertCustom", async () => {
    const registry = new ProviderRegistry({ dataDir: tmpDir, db, gatewayLayer });

    const provider = await registry.upsertCustom({
      name: "Encrypted Provider",
      type: "openai_compatible",
      baseURL: "https://api.example.com/v1",
      apiKey: "sk-test-super-secret-key-12345",
      models: [{ id: "model-a", name: "Model A" }],
    });

    assert.ok(provider.id);
    assert.equal(provider.configured, true);

    // 1. Verify providers.json does NOT contain the plaintext key
    const providersJsonPath = path.join(tmpDir, "providers.json");
    assert.ok(fs.existsSync(providersJsonPath));
    const savedContent = fs.readFileSync(providersJsonPath, "utf-8");
    assert.ok(!savedContent.includes("sk-test-super-secret-key-12345"), "Plaintext key must not exist in providers.json");

    // 2. Verify gateway_secrets table has encrypted ciphertext
    const secretRows = await db
      .select()
      .from(gatewaySecrets)
      .where(eq(gatewaySecrets.id, provider.id));
    assert.equal(secretRows.length, 1);
    assert.ok(secretRows[0].ciphertext.length > 20);
    assert.ok(!secretRows[0].ciphertext.includes("sk-test-super-secret-key-12345"), "Ciphertext must be encrypted");

    // 3. Verify getDecryptedKey can retrieve it
    const decrypted = await registry.getDecryptedKey(provider.id);
    assert.equal(decrypted, "sk-test-super-secret-key-12345");
  });

  it("preserves existing secret in gateway_secrets on metadata-only edits (omitted/empty apiKey)", async () => {
    const registry = new ProviderRegistry({ dataDir: tmpDir, db, gatewayLayer });

    // Initial save with key
    const initial = await registry.upsertCustom({
      name: "Original Name",
      type: "openai_compatible",
      baseURL: "https://api.example.com/v1",
      apiKey: "keep-me-safe-key",
      models: [{ id: "model-1", name: "Model 1" }],
    });

    // Metadata update from Settings UI without re-entering apiKey
    const updated = await registry.upsertCustom({
      id: initial.id,
      name: "Updated Name",
      type: "openai_compatible",
      baseURL: "https://api.example.com/v2",
      models: [{ id: "model-1", name: "Model 1" }, { id: "model-2", name: "Model 2" }],
    });

    assert.equal(updated.name, "Updated Name");
    assert.equal(updated.configured, true);

    // Key must still exist in SQLite and decrypt to original value
    const decrypted = await registry.getDecryptedKey(initial.id);
    assert.equal(decrypted, "keep-me-safe-key");
  });

  it("removes secret from gateway_secrets when provider is deleted", async () => {
    const registry = new ProviderRegistry({ dataDir: tmpDir, db, gatewayLayer });

    const provider = await registry.upsertCustom({
      name: "To Delete",
      type: "openai_compatible",
      apiKey: "delete-me-key",
      models: [{ id: "m", name: "M" }],
    });

    const deleted = await registry.deleteCustom(provider.id);
    assert.equal(deleted, true);

    const decrypted = await registry.getDecryptedKey(provider.id);
    assert.equal(decrypted, null);

    const secretRows = await db
      .select()
      .from(gatewaySecrets)
      .where(eq(gatewaySecrets.id, provider.id));
    assert.equal(secretRows.length, 0);
  });

  it("migrates legacy plaintext keys into gateway_secrets atomically on boot", async () => {
    const providersJsonPath = path.join(tmpDir, "providers.json");
    const legacyData = {
      defaultModel: "custom_legacy:test-m",
      customProviders: [
        {
          id: "custom_legacy",
          name: "Legacy Provider",
          type: "openai_compatible",
          baseURL: "https://legacy.example.com/v1",
          apiKey: "legacy-plain-key-999",
          models: [{ id: "test-m", name: "Test M" }],
        },
      ],
    };
    fs.writeFileSync(providersJsonPath, JSON.stringify(legacyData, null, 2), "utf-8");

    const registry = new ProviderRegistry({ dataDir: tmpDir, db, gatewayLayer });
    await registry.migrateLegacyKeys();

    // 1. Verify encrypted into SQLite
    const decrypted = await registry.getDecryptedKey("custom_legacy");
    assert.equal(decrypted, "legacy-plain-key-999");

    // 2. Verify providers.json scrubbed
    const scrubbedJson = fs.readFileSync(providersJsonPath, "utf-8");
    assert.ok(!scrubbedJson.includes("legacy-plain-key-999"));
    assert.ok(scrubbedJson.includes("Legacy Provider"));
  });
});
