import { Layer, Effect } from "effect";
import { MasterKeyProvider, VaultError } from "@kantha/gateway";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import child_process from "node:child_process";
import crypto from "node:crypto";

export interface KeyProviderOptions {
  dataDir?: string;
}

export function enforceKeyPermissions(filePath: string): void {
  if (process.platform === "win32") {
    try {
      const username = os.userInfo().username;
      if (username) {
        child_process.execFileSync(
          "icacls",
          [filePath, "/inheritance:r", "/grant:r", `${username}:(R,W)`],
          { stdio: "ignore", timeout: 2000 }
        );
      }
    } catch {
      // Best-effort if icacls is restricted in sandbox
    }
  } else {
    try {
      fs.chmodSync(filePath, 0o600);
    } catch {}
  }
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
            enforceKeyPermissions(keyPath);
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
          enforceKeyPermissions(keyPath);

          return newKey;
        },
        catch: (err) => new VaultError(`Failed to load or generate master key: ${String(err)}`),
      }),
  }));
}
