import { Context, type Effect } from "effect";
import type { VaultError } from "./vault";

export interface MasterKeyProvider {
  readonly getMasterKey: () => Effect.Effect<Buffer, VaultError>;
}

export const MasterKeyProvider = Context.GenericTag<MasterKeyProvider>("@kantha/gateway/MasterKeyProvider");
