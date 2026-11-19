import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { linkSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { ISecretStore } from '../contracts/adapters';
import type { RequestContext } from '../contracts/context';
import { GatewayDatabase } from './storage/database';

interface EncryptedSecret {
  nonce: string;
  tag: string;
  ciphertext: string;
}

const metadataScope = 'server';
const keyCheckId = 'secret-key-check';

export function loadGatewaySecretKey(db: GatewayDatabase): Buffer {
  const configured = process.env.GATEWAY_SECRET_KEY;
  if (configured) {
    const normalized = configured.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    if (!/^[A-Za-z0-9+/]{43}=$/.test(padded)) {
      throw new Error('GATEWAY_SECRET_KEY must be a base64-encoded 32-byte key.');
    }
    return Buffer.from(padded, 'base64');
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('Set GATEWAY_SECRET_KEY before starting the gateway in production.');
  }
  if (db.path === ':memory:') return randomBytes(32);

  const keyPath = `${db.path}.key`;
  try {
    return readFileSync(keyPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  const tempPath = `${keyPath}.${randomUUID()}.tmp`;
  try {
    writeFileSync(tempPath, randomBytes(32), { mode: 0o600, flag: 'wx', flush: true });
    try {
      linkSync(tempPath, keyPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    return readFileSync(keyPath);
  } finally {
    rmSync(tempPath, { force: true });
  }
}

export class GatewaySecretStore implements ISecretStore {
  private readonly key: Buffer;

  constructor(private readonly db: GatewayDatabase, key: Buffer) {
    if (key.length !== 32) throw new Error('The gateway encryption key must have 32 bytes.');
    this.key = Buffer.from(key);
    this.db.write(() => {
      const marker = this.db.get<EncryptedSecret>('metadata', metadataScope, keyCheckId);
      if (marker) {
        try {
          if (this.decrypt(metadataScope, keyCheckId, marker) !== keyCheckId) throw new Error();
        } catch {
          throw new Error('The gateway encryption key does not match the saved data.');
        }
      } else {
        this.db.put('metadata', metadataScope, keyCheckId, this.encrypt(metadataScope, keyCheckId, keyCheckId));
      }
    });
  }

  private encrypt(scope: string, ref: string, value: string): EncryptedSecret {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, nonce);
    cipher.setAAD(Buffer.from(JSON.stringify([scope, ref])));
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return {
      nonce: nonce.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      ciphertext: ciphertext.toString('base64'),
    };
  }

  private decrypt(scope: string, ref: string, encrypted: EncryptedSecret): string {
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(encrypted.nonce, 'base64'));
    decipher.setAAD(Buffer.from(JSON.stringify([scope, ref])));
    decipher.setAuthTag(Buffer.from(encrypted.tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(encrypted.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }

  async getSecret(ref: string, ctx: RequestContext): Promise<string | null> {
    const encrypted = this.db.get<EncryptedSecret>('secrets', ctx.workspaceId, ref);
    return encrypted ? this.decrypt(ctx.workspaceId, ref, encrypted) : null;
  }

  async setSecret(ref: string, value: string, ctx: RequestContext): Promise<void> {
    this.db.write(() => this.writeSecret(ref, value, ctx));
  }

  async deleteSecret(ref: string, ctx: RequestContext): Promise<boolean> {
    return this.db.write(() => this.removeSecret(ref, ctx));
  }

  // Used by the connection store as part of its transaction.
  writeSecret(ref: string, value: string, ctx: RequestContext): void {
    this.db.put('secrets', ctx.workspaceId, ref, this.encrypt(ctx.workspaceId, ref, value));
  }

  removeSecret(ref: string, ctx: RequestContext): boolean {
    return this.db.delete('secrets', ctx.workspaceId, ref);
  }
}
