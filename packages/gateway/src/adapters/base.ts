import { Effect, Stream } from "effect";
import type { InferenceRequest } from "../types/request";
import type { ProviderConfig } from "../types/provider";
import type { StreamDelta, InferenceResponse } from "../types/stream";

export class GatewayError extends Error {
  readonly _tag = "GatewayError";
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "GatewayError";
  }
}

export interface ProviderAdapter {
  readonly stream: (
    req: InferenceRequest,
    provider: ProviderConfig,
    apiKey?: string
  ) => Stream.Stream<StreamDelta, GatewayError>;

  readonly complete: (
    req: InferenceRequest,
    provider: ProviderConfig,
    apiKey?: string
  ) => Effect.Effect<InferenceResponse, GatewayError>;
}

/**
 * Creates an Effect program bound to an AbortSignal, aborting the signal when fiber is interrupted.
 */
export function createAbortableStream<T, E, R>(
  fn: (signal: AbortSignal) => Effect.Effect<T, E, R>
): Effect.Effect<T, E, R> {
  return Effect.scoped(
    Effect.gen(function* () {
      const controller = new AbortController();
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          controller.abort();
        })
      );
      return yield* fn(controller.signal);
    })
  );
}
