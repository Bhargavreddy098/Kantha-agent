import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { encryptSecret, decryptSecret } from "../cipher";
import { VaultTamperedError } from "../../ports/vault";

describe("AES-256-GCM Vault Cipher with AAD", () => {
  const masterKey = Buffer.alloc(32, 0x5a); // 256-bit key
  const secret = "sk-ant-api03-test-secret-key-12345";
  const aad = "provider:anthropic";

  it("encrypts with versioned format v1:<iv>:<tag>:<ciphertext>", () => {
    const encrypted = encryptSecret(secret, masterKey, aad);
    const parts = encrypted.split(":");
    assert.equal(parts.length, 4);
    assert.equal(parts[0], "v1");
    // IV is 12 bytes = 24 hex characters
    assert.equal(parts[1].length, 24);
    // Auth Tag is 16 bytes = 32 hex characters
    assert.equal(parts[2].length, 32);
    // Ciphertext is non-empty hex
    assert.ok(parts[3].length > 0);
  });

  it("generates a fresh unique 96-bit IV on each encryption", () => {
    const enc1 = encryptSecret(secret, masterKey, aad);
    const enc2 = encryptSecret(secret, masterKey, aad);
    const iv1 = enc1.split(":")[1];
    const iv2 = enc2.split(":")[1];
    assert.notEqual(iv1, iv2);
  });

  it("decrypts successfully when AAD matches", () => {
    const encrypted = encryptSecret(secret, masterKey, aad);
    const decrypted = decryptSecret(encrypted, masterKey, aad);
    assert.equal(decrypted, secret);
  });

  it("fails decryption when AAD is tampered (slot swapping attack)", () => {
    const encrypted = encryptSecret(secret, masterKey, "provider:anthropic");
    assert.throws(
      () => decryptSecret(encrypted, masterKey, "provider:openai"),
      (err: any) => err instanceof VaultTamperedError || err.name === "VaultTamperedError"
    );
  });

  it("fails decryption when ciphertext is tampered", () => {
    const encrypted = encryptSecret(secret, masterKey, aad);
    const parts = encrypted.split(":");
    // Mutate ciphertext
    const tampered = `${parts[0]}:${parts[1]}:${parts[2]}:${parts[3].slice(0, -2)}ff`;
    assert.throws(
      () => decryptSecret(tampered, masterKey, aad),
      (err: any) => err instanceof VaultTamperedError || err.name === "VaultTamperedError"
    );
  });
});
