import { Layer, Effect } from "effect";
import { VaultStore, VaultError } from "@kantha/gateway";
import { gatewaySecrets, eq } from "@kantha/db";

export function createSqliteVaultLayer(db: any) {
  return Layer.sync(VaultStore, () => ({
    getSecret: (key: string) =>
      Effect.tryPromise({
        try: async () => {
          const rows = await db
            .select()
            .from(gatewaySecrets)
            .where(eq(gatewaySecrets.id, key))
            .limit(1);
          return rows.length > 0 ? (rows[0].ciphertext as string) : null;
        },
        catch: (err) => new VaultError(`Failed to get secret from sqlite: ${String(err)}`),
      }),

    setSecret: (key: string, value: string) =>
      Effect.tryPromise({
        try: async () => {
          const now = Date.now();
          await db
            .insert(gatewaySecrets)
            .values({
              id: key,
              ciphertext: value,
              createdAt: now,
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: gatewaySecrets.id,
              set: {
                ciphertext: value,
                updatedAt: now,
              },
            });
        },
        catch: (err) => new VaultError(`Failed to save secret to sqlite: ${String(err)}`),
      }),

    deleteSecret: (key: string) =>
      Effect.tryPromise({
        try: async () => {
          await db.delete(gatewaySecrets).where(eq(gatewaySecrets.id, key));
        },
        catch: (err) => new VaultError(`Failed to delete secret from sqlite: ${String(err)}`),
      }),

    listKeys: () =>
      Effect.tryPromise({
        try: async () => {
          const rows = await db.select({ id: gatewaySecrets.id }).from(gatewaySecrets);
          return rows.map((r: any) => r.id as string);
        },
        catch: (err) => new VaultError(`Failed to list secret keys from sqlite: ${String(err)}`),
      }),
  }));
}
