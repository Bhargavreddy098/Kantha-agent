import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Effect } from "effect";
import { MasterKeyProvider } from "@kantha/gateway";
import { createMasterKeyLayer, enforceKeyPermissions } from "../gateway/key-provider";

describe("Master Key Provider & Permissions", () => {
  it("generates a 32-byte master key and enforces file permissions", async () => {
    const tmpDir = path.join(os.tmpdir(), `kantha-key-test-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });

    try {
      const layer = createMasterKeyLayer({ dataDir: tmpDir });
      const program = Effect.gen(function* () {
        const provider = yield* MasterKeyProvider;
        const key1 = yield* provider.getMasterKey();
        assert.equal(key1.length, 32);

        // Subsequent call loads the existing key
        const key2 = yield* provider.getMasterKey();
        assert.deepEqual(key1, key2);

        return key1;
      });

      const result = await Effect.runPromise(program.pipe(Effect.provide(layer)));
      assert.ok(result);

      const keyPath = path.join(tmpDir, "gateway.key");
      assert.ok(fs.existsSync(keyPath));

      // Test enforceKeyPermissions directly on the key path
      assert.doesNotThrow(() => {
        enforceKeyPermissions(keyPath);
      });
    } finally {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    }
  });
});
