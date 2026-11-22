import { Layer, Effect } from "effect";
import { MasterKeyProvider, VaultError } from "@kantha/gateway";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export interface KeyProviderOptions {
  dataDir?: string;
}

export function createMasterKeyLayer(options: KeyProviderOptions = {}) {
  const dataDir =
    options.dataDir ||
    process.env.KANTHA_DATA_DIR ||
    path.resolve(process.cwd(), ".kantha-data");
  const keyPath = path.join(dataDir, "gateway.key");

  return Layer.sync(MasterKeyProvider, () => ({
    getMasterKey: () =>
      Effect.try({
        try: () => {
          // 1. Environment variable override
          const envKey = process.env.KANTHA_GATEWAY_MASTER_KEY;
          if (envKey) {
            const buf = Buffer.from(envKey, envKey.length === 64 ? "hex" : "utf-8");
            if (buf.length >= 32) return buf.subarray(0, 32);
            return crypto.createHash("sha256").update(buf).digest();
          }

          // 2. File-based master key
          if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
          }

          if (fs.existsSync(keyPath)) {
            const existing = fs.readFileSync(keyPath);
            if (existing.length >= 32) {
              return existing.subarray(0, 32);
            }
          }

          // 3. Generate fresh random 256-bit key
          const newKey = crypto.randomBytes(32);
          try {
            fs.writeFileSync(keyPath, newKey, { mode: 0o600 });
          } catch {
            fs.writeFileSync(keyPath, newKey);
          }

          return newKey;
        },
        catch: (err) => new VaultError(`Failed to load or generate master key: ${String(err)}`),
      }),
  }));
}
