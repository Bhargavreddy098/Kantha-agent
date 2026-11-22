import { Context, type Effect } from "effect";

export class CatalogError extends Error {
  readonly _tag = "CatalogError";
}

export interface CatalogCacheStore {
  readonly getCachedCatalog: () => Effect.Effect<string | null, CatalogError>;
  readonly setCachedCatalog: (rawJson: string) => Effect.Effect<void, CatalogError>;
}

export const CatalogCacheStore = Context.GenericTag<CatalogCacheStore>("@kantha/gateway/CatalogCacheStore");
