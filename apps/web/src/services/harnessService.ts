import { safeJson } from "./providerService";

export interface ProviderHealthMetric {
  providerId: string;
  state: "closed" | "open" | "half_open";
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  retriedRequests: number;
  fallbackRequests: number;
  consecutiveFailures: number;
  latencyEmaMs: number;
  lastError?: string;
  lastSuccessAt?: number;
  lastFailureAt?: number;
  openedAt?: number;
  nextRetryAt?: number;
}

export interface LedgerTurnSummary {
  id: string;
  providerId: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  costUsd: number;
  status: string;
  timestamp: number;
}

export interface GatewayHealthResponse {
  status: "healthy" | "degraded";
  updatedAt: number;
  defaultModel: string;
  providers: ProviderHealthMetric[];
  totals: {
    requests: number;
    successes: number;
    failures: number;
    retries: number;
    fallbacks: number;
  };
  ledger: {
    totalTurns: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalReasoningTokens: number;
    totalCostUsd: number;
    recentTurns: LedgerTurnSummary[];
  };
}

export interface HarnessToolMeta {
  name: string;
  description: string;
  category: "filesystem" | "search" | "git" | "runtime";
  risk: "read" | "write" | "exec";
  requiresApproval: boolean;
  parameters: Record<string, unknown>;
}

export interface HarnessToolsResponse {
  count: number;
  tools: HarnessToolMeta[];
}

export interface HarnessSessionInfo {
  id: string;
  title: string;
  workspacePath?: string;
  status: string;
  createdAt?: number;
  updatedAt: number;
}

export interface PlanStepItem {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "completed" | "failed" | "skipped";
  detail?: string;
}

export const harnessService = {
  async getGatewayHealth(): Promise<GatewayHealthResponse> {
    const res = await fetch("/api/gateway/health", { credentials: "include" });
    return safeJson<GatewayHealthResponse>(res);
  },

  async getToolsCatalog(): Promise<HarnessToolsResponse> {
    const res = await fetch("/api/harness/tools", { credentials: "include" });
    return safeJson<HarnessToolsResponse>(res);
  },

  async listSessions(): Promise<{ sessions: HarnessSessionInfo[] }> {
    const res = await fetch("/api/sessions", { credentials: "include" });
    return safeJson<{ sessions: HarnessSessionInfo[] }>(res);
  },

  async createSession(title?: string): Promise<HarnessSessionInfo> {
    const res = await fetch("/api/sessions", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title || "Autonomous Orchestration Run" }),
    });
    return safeJson<HarnessSessionInfo>(res);
  },

  async submitPrompt(
    sessionId: string,
    payload: {
      prompt: string;
      modelId?: string;
      providerId?: string;
      autoApprove?: boolean;
      maxSteps?: number;
    }
  ): Promise<{ status: string; sessionId: string; runId: string; providerId?: string; modelId?: string }> {
    const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/prompt`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return safeJson(res);
  },

  async resolveApproval(
    sessionId: string,
    approvalId: string,
    decision: "approve" | "reject",
    feedback?: string
  ): Promise<{ success: boolean }> {
    const res = await fetch(
      `/api/sessions/${encodeURIComponent(sessionId)}/approvals/${encodeURIComponent(approvalId)}`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, feedback }),
      }
    );
    return safeJson(res);
  },

  async abortSession(sessionId: string): Promise<{ success: boolean; aborted: boolean }> {
    const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/abort`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    return safeJson(res);
  },
};
