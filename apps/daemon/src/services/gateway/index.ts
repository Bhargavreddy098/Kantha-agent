import { Layer } from "effect";
import {
  GatewayServiceLive,
  VaultServiceLive,
  CatalogServiceLive,
  GatewayService,
} from "@kantha/gateway";
import { createMasterKeyLayer } from "./key-provider";
import { createSqliteVaultLayer } from "./sqlite-vault";
import { createSqliteLedgerLayer } from "./sqlite-ledger";
import { createFileProviderLayer } from "./file-providers";
import { createFileCatalogCacheLayer } from "./file-cache";

export interface DaemonGatewayOptions {
  db: any;
  dataDir?: string;
}

export function createDaemonGatewayLayer(options: DaemonGatewayOptions) {
  const masterKeyLayer = createMasterKeyLayer({ dataDir: options.dataDir });
  const vaultStoreLayer = createSqliteVaultLayer(options.db);
  const ledgerStoreLayer = createSqliteLedgerLayer(options.db);
  const providerStoreLayer = createFileProviderLayer({ dataDir: options.dataDir });
  const catalogCacheStoreLayer = createFileCatalogCacheLayer({ dataDir: options.dataDir });

  const daemonPortsLayer = Layer.mergeAll(
    masterKeyLayer,
    vaultStoreLayer,
    ledgerStoreLayer,
    providerStoreLayer,
    catalogCacheStoreLayer
  );

  return GatewayServiceLive.pipe(
    Layer.provide(VaultServiceLive),
    Layer.provide(CatalogServiceLive),
    Layer.provideMerge(daemonPortsLayer)
  );
}

export * from "./key-provider";
export * from "./sqlite-vault";
export * from "./sqlite-ledger";
export * from "./file-providers";
export * from "./file-cache";
