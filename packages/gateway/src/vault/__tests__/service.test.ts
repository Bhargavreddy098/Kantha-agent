import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Effect } from "effect";
import { VaultService, VaultServiceLive } from "../service";
import { InMemoryPortsLayer } from "../../ports/in-memory";

describe("VaultService", () => {
  it("stores and decrypts provider API keys securely", async () => {
    const program = Effect.gen(function* () {
      const vault = yield* VaultService;
      yield* vault.storeSecret("anthropic", "sk-ant-test-key");
      const decrypted = yield* vault.getDecryptedKey("anthropic");
      const missing = yield* vault.getDecryptedKey("unknown");
      return { decrypted, missing };
    }).pipe(
      Effect.provide(VaultServiceLive),
      Effect.provide(InMemoryPortsLayer)
    );

    const result = await Effect.runPromise(program);
    assert.equal(result.decrypted, "sk-ant-test-key");
    assert.equal(result.missing, null);
  });
});
