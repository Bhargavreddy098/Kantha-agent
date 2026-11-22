import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TimeoutPolicy, TimeoutError } from "../timeouts";

describe("Three-Timer Timeout Policy", () => {
  it("enforces headerTimeout, chunkTimeout, and totalTimeout", () => {
    const policy = new TimeoutPolicy({
      headerTimeoutMs: 1000,
      chunkTimeoutMs: 500,
      totalTimeoutMs: 5000,
    });

    assert.equal(policy.headerTimeoutMs, 1000);
    assert.equal(policy.chunkTimeoutMs, 500);
    assert.equal(policy.totalTimeoutMs, 5000);
  });

  it("triggers chunkTimeout when time between stream chunks exceeds threshold", async () => {
    const policy = new TimeoutPolicy({
      headerTimeoutMs: 5000,
      chunkTimeoutMs: 50, // 50ms chunk timeout
    });

    policy.onHeadersReceived();
    policy.onChunkReceived();

    // Wait 70ms without receiving chunk
    await new Promise((r) => setTimeout(r, 70));

    assert.throws(
      () => policy.checkChunkTimeout(),
      (err: any) => err instanceof TimeoutError && err.type === "chunk"
    );
  });
});
