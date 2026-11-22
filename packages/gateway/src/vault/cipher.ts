import crypto from "node:crypto";
import { VaultError, VaultTamperedError } from "../ports/vault";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12; // 96-bit IV
const VERSION_PREFIX = "v1";

/**
 * Encrypts a plaintext secret using AES-256-GCM with a fresh 96-bit IV and Additional Authenticated Data (AAD).
 * Output format: `v1:<hex_iv>:<hex_auth_tag>:<hex_ciphertext>`
 */
export function encryptSecret(plaintext: string, key: Buffer, aad: string): string {
  if (key.length !== 32) {
    throw new VaultError("Master key must be exactly 32 bytes (256 bits)");
  }

  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from(aad, "utf-8"));

  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(plaintext, "utf-8")),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `${VERSION_PREFIX}:${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

/**
 * Decrypts a versioned AES-256-GCM ciphertext payload and validates the AAD.
 * Throws VaultTamperedError if tag verification fails or AAD does not match.
 */
export function decryptSecret(payload: string, key: Buffer, aad: string): string {
  if (key.length !== 32) {
    throw new VaultError("Master key must be exactly 32 bytes (256 bits)");
  }

  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION_PREFIX) {
    throw new VaultTamperedError(`Invalid vault payload format: expected v1:<iv>:<tag>:<ciphertext>`);
  }

  const [, ivHex, tagHex, cipherHex] = parts;

  try {
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(tagHex, "hex");
    const ciphertext = Buffer.from(cipherHex, "hex");

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAAD(Buffer.from(aad, "utf-8"));
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return decrypted.toString("utf-8");
  } catch (err: any) {
    throw new VaultTamperedError(`Decryption failed or AAD mismatch: ${err.message || String(err)}`);
  }
}
