/**
 * Gateway Health & Readiness Contracts
 * Route endpoints:
 *   GET /api/gateway/health/live
 *   GET /api/gateway/health/ready
 *   GET /api/gateway/status
 */

export type GatewayHealthStatus = 'starting' | 'ready' | 'draining' | 'stopping' | 'error';
export type ComponentHealth = 'healthy' | 'degraded' | 'unhealthy' | 'initializing';

export interface LivenessResponse {
  status: 'ok' | 'error';
  timestamp: string;
  uptimeSeconds: number;
  pid?: number;
}

export interface ReadinessResponse {
  status: GatewayHealthStatus;
  ready: boolean;
  version: string;
  checkedAt: string;
  retryAfterSeconds?: number;
  components: {
    storage: ComponentHealth;
    secrets: ComponentHealth;
    activeConnections: ComponentHealth;
    eventBus: ComponentHealth;
  };
}

export interface GatewayStatusResponse {
  status: GatewayHealthStatus;
  ready: boolean;
  version: string;
  checkedAt: string;
  requestId: string;
  workspaceId?: string;
  components: {
    storage: ComponentHealth;
    secrets: ComponentHealth;
    activeConnections: ComponentHealth;
    eventBus: ComponentHealth;
  };
  metrics: {
    uptimeSeconds: number;
    activeSessions: number;
    activeRuns: number;
    memoryMb: number;
  };
  diagnostics?: Record<string, unknown>;
}
