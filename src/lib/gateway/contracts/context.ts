/**
 * Gateway Request Context & Ingress Header Directives
 * Standardizes metadata, tenant resolution, and caller identity.
 */

export interface CallerIdentity {
  type: 'user' | 'service' | 'anonymous';
  id: string;
  name?: string;
  roles?: string[];
}

export interface RequestContext {
  requestId: string;
  workspaceId: string;
  caller: CallerIdentity;
  timestamp: number;
  directory?: string;
  capabilities?: string[];
  clientIp?: string;
  userAgent?: string;
}

export const GATEWAY_HEADERS = {
  REQUEST_ID: 'x-request-id',
  WORKSPACE_ID: 'x-workspace-id',
  DIRECTORY: 'x-opencode-directory',
  TOKEN: 'x-opencode-token',
  CAPABILITIES: 'x-opencode-capabilities',
  ACTOR_ID: 'x-actor-id',
  RETRY_AFTER: 'retry-after',
} as const;

export function createRequestContext(partial: Partial<RequestContext> & { workspaceId: string }): RequestContext {
  return {
    requestId: partial.requestId || `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    workspaceId: partial.workspaceId,
    caller: partial.caller || {
      type: 'user',
      id: 'usr_default',
    },
    timestamp: partial.timestamp || Date.now(),
    directory: partial.directory,
    capabilities: partial.capabilities || [],
    clientIp: partial.clientIp,
    userAgent: partial.userAgent,
  };
}
