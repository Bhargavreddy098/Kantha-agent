import type { GatewayConnection } from '../contracts/connection';

export function publicConnection({ secretRef, ...metadata }: GatewayConnection): Omit<GatewayConnection, 'secretRef'> {
  return { ...metadata, hasCredential: Boolean(secretRef) };
}
