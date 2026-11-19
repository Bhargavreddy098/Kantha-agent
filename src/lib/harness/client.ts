import { gatewayRequest, jsonBody } from '@/lib/gateway/client';
import type { GatewaySession } from '@/lib/gateway/contracts/session';
import type { HarnessRunView, HarnessSubmitResult } from './contracts';

export interface HarnessSubmitInput {
  inputId: string;
  sessionId: string;
  task: string;
  scope?: { repositoryId?: string; allowedRoots?: string[] };
  pinned?: {
    baseRevision?: string;
    modelId?: string;
    profile?: {
      maxSteps?: number;
      maxRepairs?: number;
      maxElapsedMs?: number;
    };
  };
  acceptance?: Array<{ id: string; behavior: string; check: string; required: boolean }>;
}

/** Create an authorized gateway session for a harness task when Chat has none. */
export function createHarnessSession(title = 'Harness task'): Promise<GatewaySession> {
  return gatewayRequest<GatewaySession>('/api/gateway/sessions', {
    method: 'POST',
    ...jsonBody({ title }),
  });
}

export function submitHarnessRun(input: HarnessSubmitInput): Promise<HarnessSubmitResult> {
  return gatewayRequest<HarnessSubmitResult>('/api/gateway/harness/runs', {
    method: 'POST',
    ...jsonBody(input),
  });
}

export function getHarnessRun(runId: string, signal?: AbortSignal): Promise<HarnessRunView> {
  return gatewayRequest<HarnessRunView>(`/api/gateway/harness/runs/${encodeURIComponent(runId)}`, { signal });
}

export function cancelHarnessRun(runId: string, reason = 'Cancelled from Chat'): Promise<{ runId: string; status: string }> {
  return gatewayRequest<{ runId: string; status: string }>(`/api/gateway/harness/runs/${encodeURIComponent(runId)}/cancel`, {
    method: 'POST',
    ...jsonBody({ reason }),
  });
}

export function recoverHarnessRuns(): Promise<{ recovered: number }> {
  return gatewayRequest<{ recovered: number }>('/api/gateway/harness/recover', { method: 'POST' });
}
