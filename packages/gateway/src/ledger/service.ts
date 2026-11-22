import { Effect, Duration } from "effect";
import { LedgerStore } from "../ports/ledger";
import type { LedgerEntry } from "../types/usage";

/**
 * Registers an Effect finalizer that settles turn usage in LedgerStore.
 * Wrapped with a 2-second timeout and catchAll so a deadlocked or slow database
 * never blocks turn cancellation.
 */
export function settleTurnUsageNonBlocking(entry: LedgerEntry): Effect.Effect<void, never, LedgerStore | import("effect/Scope").Scope> {
  return Effect.gen(function* () {
    const ledger = yield* LedgerStore;

    yield* Effect.addFinalizer(() =>
      ledger.recordTurnUsage(entry).pipe(
        Effect.timeout(Duration.seconds(2)),
        Effect.catchAll(() => Effect.void),
        Effect.forkDaemon,
        Effect.asVoid
      )
    );
  });
}
