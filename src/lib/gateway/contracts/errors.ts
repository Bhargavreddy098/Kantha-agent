/**
 * Canonical Gateway Error Definitions & Envelopes
 * Standard error codes and wire format for Kantha Gateway.
 */

export type GatewayErrorCode =
  | 'invalid_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'service_unavailable'
  | 'service_starting'
  | 'service_stopping'
  | 'upstream_failed'
  | 'upstream_timeout'
  | 'budget_exceeded'
  | 'subscriber_overflow'
  | 'internal_error';

export interface GatewayErrorEnvelope {
  code: GatewayErrorCode;
  message: string;
  requestId: string;
  retryAfterSeconds?: number;
  field?: string;
  resource?: string;
  details?: unknown;
}

export const GATEWAY_HTTP_STATUS_MAP: Record<GatewayErrorCode, number> = {
  invalid_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  service_unavailable: 503,
  service_starting: 503,
  service_stopping: 503,
  upstream_failed: 502,
  upstream_timeout: 504,
  budget_exceeded: 402,
  subscriber_overflow: 429,
  internal_error: 500,
};

const gatewayErrorBrand = Symbol.for('kantha.gateway.error');

export class GatewayError extends Error {
  private readonly [gatewayErrorBrand] = true;

  // The Next.js instrumentation bundle and route bundles can each load this class.
  static [Symbol.hasInstance](value: unknown): boolean {
    return typeof value === 'object' && value !== null && gatewayErrorBrand in value;
  }

  public readonly code: GatewayErrorCode;
  public readonly requestId: string;
  public readonly retryAfterSeconds?: number;
  public readonly field?: string;
  public readonly resource?: string;
  public readonly details?: unknown;
  public readonly statusCode: number;

  constructor(params: {
    code: GatewayErrorCode;
    message: string;
    requestId: string;
    retryAfterSeconds?: number;
    field?: string;
    resource?: string;
    details?: unknown;
    statusCode?: number;
  }) {
    super(params.message);
    this.name = 'GatewayError';
    this.code = params.code;
    this.requestId = params.requestId;
    this.retryAfterSeconds = params.retryAfterSeconds;
    this.field = params.field;
    this.resource = params.resource;
    this.details = params.details;
    this.statusCode = params.statusCode ?? GATEWAY_HTTP_STATUS_MAP[params.code] ?? 500;
  }

  public toEnvelope(): GatewayErrorEnvelope {
    return {
      code: this.code,
      message: this.message,
      requestId: this.requestId,
      ...(this.retryAfterSeconds !== undefined ? { retryAfterSeconds: this.retryAfterSeconds } : {}),
      ...(this.field !== undefined ? { field: this.field } : {}),
      ...(this.resource !== undefined ? { resource: this.resource } : {}),
      ...(this.details !== undefined ? { details: this.details } : {}),
    };
  }
}

export function createGatewayError(params: {
  code: GatewayErrorCode;
  message: string;
  requestId?: string;
  retryAfterSeconds?: number;
  field?: string;
  resource?: string;
  details?: unknown;
  statusCode?: number;
}): GatewayError {
  return new GatewayError({
    code: params.code,
    message: params.message,
    requestId: params.requestId || `req_err_${Date.now().toString(36)}`,
    retryAfterSeconds: params.retryAfterSeconds,
    field: params.field,
    resource: params.resource,
    details: params.details,
    statusCode: params.statusCode,
  });
}

export function isGatewayErrorEnvelope(value: unknown): value is GatewayErrorEnvelope {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.code === 'string' &&
    typeof candidate.message === 'string' &&
    typeof candidate.requestId === 'string'
  );
}
