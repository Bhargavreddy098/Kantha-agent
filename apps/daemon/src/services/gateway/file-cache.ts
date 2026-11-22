import { Layer, Effect } from "effect";
import { CatalogCacheStore, CatalogError } from "@kantha/gateway";
import fs from "node:fs";
import path from "node:path";

export interface FileCacheOptions {
  dataDir?: string;
}

export function createFileCatalogCacheLayer(options: FileCacheOptions = {}) {
  const dataDir =
    options.dataDir ||
    process.env.KANTHA_DATA_DIR ||
    path.resolve(process.cwd(), ".kantha-data");
  const filePath = path.join(dataDir, "catalog_cache.json");

  return Layer.sync(CatalogCacheStore, () => ({
    getCachedCatalog: () =>
      Effect.try({
        try: () => {
          if (fs.existsSync(filePath)) {
            return fs.readFileSync(filePath, "utf-8");
          }
          return null;
        },
        catch: (err) => new CatalogError(`Failed to read cached catalog from disk: ${String(err)}`),
      }),

    setCachedCatalog: (rawJson: string) =>
      Effect.try({
        try: () => {
          if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
          }
          fs.writeFileSync(filePath, rawJson, "utf-8");
        },
        catch: (err) => new CatalogError(`Failed to save cached catalog to disk: ${String(err)}`),
      }),
  }));
}
