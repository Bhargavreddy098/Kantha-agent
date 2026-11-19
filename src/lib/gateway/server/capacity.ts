import type { RequestContext } from '../contracts/context';
import { createGatewayError, type GatewayErrorCode } from '../contracts/errors';

export function readCapacityLimit(name: string, fallback: number): number {
  const setting = process.env[name];
  if (setting === undefined || setting === '') return fallback;
  const value = Number(setting);
  if (!/^\d+$/.test(setting) || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

/** An in-process concurrency limit shared by every route using this workload. */
export class GatewayCapacity {
  private active = 0;
  private readonly byWorkspace = new Map<string, number>();

  constructor(
    private readonly processLimit: number,
    private readonly workspaceLimit: number,
    private readonly workspaceCode: Extract<GatewayErrorCode, 'rate_limited' | 'subscriber_overflow'>,
    private readonly workload: string,
  ) {}

  snapshot(workspaceId: string) {
    return {
      active: this.byWorkspace.get(workspaceId) ?? 0,
      workspaceLimit: Math.min(this.workspaceLimit, this.processLimit),
      processLimit: this.processLimit,
    };
  }

  acquire(ctx: RequestContext): () => void {
    const workspaceId = ctx.workspaceId;
    const count = this.byWorkspace.get(workspaceId) ?? 0;
    const workspaceFull = count >= this.workspaceLimit;
    if (workspaceFull || this.active >= this.processLimit) {
      throw createGatewayError({
        code: workspaceFull ? this.workspaceCode : 'service_unavailable',
        message: `${this.workload} is at capacity. Try again shortly.`,
        requestId: ctx.requestId,
        retryAfterSeconds: 2,
      });
    }

    this.active++;
    this.byWorkspace.set(workspaceId, count + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active--;
      const remaining = (this.byWorkspace.get(workspaceId) ?? 1) - 1;
      if (remaining === 0) this.byWorkspace.delete(workspaceId);
      else this.byWorkspace.set(workspaceId, remaining);
    };
  }
}
