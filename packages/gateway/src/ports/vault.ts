import { Context, type Effect } from "effect";

export class VaultError extends Error {
  readonly _tag: string = "VaultError";
}

export class VaultTamperedError extends VaultError {
  override readonly _tag: string = "VaultTamperedError";
}

export interface VaultStore {
  readonly getSecret: (key: string) => Effect.Effect<string | null, VaultError>;
  readonly setSecret: (key: string, encryptedValue: string) => Effect.Effect<void, VaultError>;
  readonly deleteSecret: (key: string) => Effect.Effect<void, VaultError>;
  readonly listKeys: () => Effect.Effect<string[], VaultError>;
}

export const VaultStore = Context.GenericTag<VaultStore>("@kantha/gateway/VaultStore");
