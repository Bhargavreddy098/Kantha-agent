import { Context, type Effect } from "effect";
import type { ProviderConfig } from "../types/provider";

export class ProviderError extends Error {
  readonly _tag = "ProviderError";
}

export interface ProviderStore {
  readonly getProvider: (providerId: string) => Effect.Effect<ProviderConfig | null, ProviderError>;
  readonly listProviders: () => Effect.Effect<ProviderConfig[], ProviderError>;
  readonly saveProvider: (provider: ProviderConfig) => Effect.Effect<void, ProviderError>;
  readonly deleteProvider: (providerId: string) => Effect.Effect<void, ProviderError>;
}

export const ProviderStore = Context.GenericTag<ProviderStore>("@kantha/gateway/ProviderStore");
