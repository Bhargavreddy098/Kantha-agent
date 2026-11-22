import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Effect, Fiber } from "effect";
import { createAbortableStream } from "../base";

describe("Fiber Interruption & AbortSignal Propagation", () => {
  it("triggers AbortController.abort() when fiber is interrupted", async () => {
    let aborted = false;

    const program = createAbortableStream((signal) => {
      signal.addEventListener("abort", () => {
        aborted = true;
      });
      return Effect.never; // Never-ending stream
    });

    const fiber = Effect.runFork(program);
    await new Promise((r) => setTimeout(r, 30));

    // Interrupt fiber
    await Effect.runPromise(Fiber.interrupt(fiber));

    assert.equal(aborted, true);
  });
});
