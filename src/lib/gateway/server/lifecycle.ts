import type { GatewayHealthStatus, ComponentHealth, LivenessResponse, ReadinessResponse, GatewayStatusResponse } from '../contracts/health';
import type { RequestContext } from '../contracts/context';
import { createGatewayError } from '../contracts/errors';
import { checkGatewayAccessConfiguration } from './access';

export class GatewayLifecycleManager {
  private status: GatewayHealthStatus = 'starting';
  private readonly startedAt = Date.now();
  private retryAfterSeconds = 5;
  private readonly components = {
    storage: 'initializing' as ComponentHealth,
    secrets: 'initializing' as ComponentHealth,
    activeConnections: 'initializing' as ComponentHealth,
    eventBus: 'initializing' as ComponentHealth,
  };

  constructor(private readonly checkStorage: () => boolean) {}

  public setStatus(status: GatewayHealthStatus, retryAfter?: number): void {
    this.status = status;
    if (retryAfter !== undefined) this.retryAfterSeconds = retryAfter;
  }

  public refresh(): void {
    if (this.status === 'draining' || this.status === 'stopping') return;
    try {
      if (!this.checkStorage()) throw new Error('Gateway store not available');
      this.components.storage = 'healthy';
      this.components.secrets = 'healthy';
      this.components.activeConnections = 'healthy';
      this.components.eventBus = 'healthy';
      checkGatewayAccessConfiguration();
      this.status = 'ready';
    } catch {
      if (this.components.storage === 'initializing') this.components.storage = 'unhealthy';
      this.status = 'error';
    }
  }

  public getLiveness(): LivenessResponse {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
    };
  }

  public getReadiness(): ReadinessResponse {
    const ready = this.status === 'ready';
    return {
      status: this.status,
      ready,
      version: '0.1.0',
      checkedAt: new Date().toISOString(),
      ...(ready ? {} : { retryAfterSeconds: this.retryAfterSeconds }),
      components: { ...this.components },
    };
  }

  public getGatewayStatus(ctx: RequestContext, metrics: { activeSessions: number; activeRuns: number }): GatewayStatusResponse {
    return {
      ...this.getReadiness(),
      requestId: ctx.requestId,
      workspaceId: ctx.workspaceId,
      metrics: {
        ...metrics,
        uptimeSeconds: this.getLiveness().uptimeSeconds,
        memoryMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      },
    };
  }

  public ensureReady(): void {
    this.refresh();
    const state = this.getReadiness();
    if (state.ready) return;
    throw createGatewayError({
      code: state.status === 'draining' || state.status === 'stopping' ? 'service_stopping' : 'service_unavailable',
      message: 'The gateway is temporarily unavailable.',
      retryAfterSeconds: state.retryAfterSeconds,
    });
  }
}
