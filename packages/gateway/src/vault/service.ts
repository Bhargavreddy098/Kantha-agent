import { Context, Effect, Layer } from "effect";
import { VaultStore, VaultError } from "../ports/vault";
import { MasterKeyProvider } from "../ports/master-key";
import { encryptSecret, decryptSecret } from "./cipher";

export interface VaultService {
  readonly storeSecret: (providerId: string, apiKey: string) => Effect.Effect<void, VaultError>;
  readonly getDecryptedKey: (providerId: string) => Effect.Effect<string | null, VaultError>;
  readonly deleteSecret: (providerId: string) => Effect.Effect<void, VaultError>;
}

export const VaultService = Context.GenericTag<VaultService>("@kantha/gateway/VaultService");

export const VaultServiceLive = Layer.effect(
  VaultService,
  Effect.gen(function* () {
    const vaultStore = yield* VaultStore;
    const masterKeyProvider = yield* MasterKeyProvider;

    return {
      storeSecret: (providerId: string, apiKey: string) =>
        Effect.gen(function* () {
          const key = yield* masterKeyProvider.getMasterKey();
          const aad = `provider:${providerId}`;
          const encrypted = encryptSecret(apiKey, key, aad);
          yield* vaultStore.setSecret(providerId, encrypted);
        }),

      getDecryptedKey: (providerId: string) =>
        Effect.gen(function* () {
          const encrypted = yield* vaultStore.getSecret(providerId);
          if (!encrypted) return null;
          const key = yield* masterKeyProvider.getMasterKey();
          const aad = `provider:${providerId}`;
          return decryptSecret(encrypted, key, aad);
        }),

      deleteSecret: (providerId: string) => vaultStore.deleteSecret(providerId),
    };
  })
);

// Companion Default layer that builds on VaultStore & MasterKeyProvider
export const VaultServiceDefault = VaultServiceLive;
// Attach Default to tag for ergonomic usage
(VaultService as any).Default = VaultServiceDefault;
