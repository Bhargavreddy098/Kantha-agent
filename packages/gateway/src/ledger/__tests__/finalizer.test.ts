import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Effect, Layer, Fiber } from "effect";
import { LedgerStore } from "../../ports/ledger";
import { settleTurnUsageNonBlocking } from "../service";
import type { LedgerEntry } from "../../types/usage";

describe("Non-Blocking Ledger Finalizer", () => {
  it("does not hang turn cancellation even if LedgerStore is completely hung", async () => {
    // A mock LedgerStore that hangs indefinitely on recordTurnUsage
    const HungLedgerLayer = Layer.succeed(LedgerStore, {
      checkBudget: () => Effect.succeed({ allowed: true }),
      recordTurnUsage: () => Effect.never, // simulates deadlocked database
      getSessionUsage: () => Effect.die("unimplemented"),
    });

    const mockEntry: LedgerEntry = {
      id: "tx-hung",
      sessionId: "s1",
      providerId: "anthropic",
      modelId: "claude-3-7-sonnet",
      inputTokens: 10,
      outputTokens: 5,
      reasoningTokens: 0,
      cacheReadTokens: 0,
      cacheWrite5mTokens: 0,
      cacheWrite1hTokens: 0,
      costUsd: 0.001,
      estimated: false,
      status: "interrupted",
      timestamp: Date.now(),
    };

    const program = Effect.scoped(
      Effect.gen(function* () {
        // Register the non-blocking finalizer
        yield* settleTurnUsageNonBlocking(mockEntry);
        // Simulate ongoing stream that gets interrupted
        return yield* Effect.never;
      })
    ).pipe(Effect.provide(HungLedgerLayer));

    const startTime = Date.now();
    const fiber = Effect.runFork(program);

    await new Promise((r) => setTimeout(r, 20));

    // Interrupt the fiber
    await Effect.runPromise(Fiber.interrupt(fiber));
    const elapsed = Date.now() - startTime;

    // Cancellation should resolve quickly (under 2.5s) without waiting on hung ledger
    assert.ok(elapsed < 2500, `Elapsed ${elapsed}ms exceeded non-blocking threshold`);
  });
});
