/**
 * Deterministic Test Scenarios
 * Defines complete system state fixtures for:
 * 1. Idle scenario
 * 2. Running scenario
 * 3. Error scenario (rate limit & service unavailable)
 * 4. Reconnect scenario (cursor recovery & resync signal)
 * 5. Approval scenario (inert fixture tool pending & resolved)
 */

import type { GatewayStatusResponse } from '../contracts/health';
import type { GatewayConnection } from '../contracts/connection';
import type { GatewayModel } from '../contracts/model';
import type { GatewaySession } from '../contracts/session';
import type { GatewayRun, RunSnapshot } from '../contracts/run';
import type { GatewayApproval } from '../contracts/approval';
import type { GatewayUsageSummary, AttemptAccounting } from '../contracts/usage';
import type { GatewayEvent } from '../contracts/event';
import type { GatewayErrorEnvelope } from '../contracts/errors';
import {
  SEED_WORKSPACE_ID,
  SEED_SESSION_ID,
  SEED_RUN_ID,
  SEED_APPROVAL_ID,
  seedConnections,
  seedModels,
  seedSession,
  seedRun,
  seedApproval,
  seedUsageSummary,
  seedUIMessages,
} from './seed-data';

// ============================================================================
// 1. IDLE SCENARIO
// System ready, connections active, no active run, zero pending approvals.
// ============================================================================

export interface IdleScenarioFixture {
  name: 'idle';
  status: GatewayStatusResponse;
  connections: GatewayConnection[];
  models: GatewayModel[];
  session: GatewaySession;
  activeRun: null;
  pendingApproval: null;
  usage: GatewayUsageSummary;
}

export const idleScenario: IdleScenarioFixture = {
  name: 'idle',
  status: {
    status: 'ready',
    ready: true,
    version: '0.1.0',
    checkedAt: '2026-11-15T10:00:00.000Z',
    requestId: 'req_idle_probe_001',
    workspaceId: SEED_WORKSPACE_ID,
    components: {
      storage: 'healthy',
      secrets: 'healthy',
      activeConnections: 'healthy',
      eventBus: 'healthy',
    },
    metrics: {
      uptimeSeconds: 86400,
      activeSessions: 1,
      activeRuns: 0,
      memoryMb: 128,
    },
  },
  connections: seedConnections,
  models: seedModels,
  session: {
    ...seedSession,
    activeRunId: undefined,
  },
  activeRun: null,
  pendingApproval: null,
  usage: {
    ...seedUsageSummary,
    totals: {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
      totalRequests: 0,
    },
  },
};

// ============================================================================
// 2. RUNNING SCENARIO
// Active session with run in 'running' state, live token deltas and attempt reservation.
// ============================================================================

export interface RunningScenarioFixture {
  name: 'running';
  session: GatewaySession;
  run: GatewayRun;
  events: GatewayEvent[];
  attemptReservation: AttemptAccounting;
}

export const runningScenario: RunningScenarioFixture = {
  name: 'running',
  session: {
    ...seedSession,
    activeRunId: SEED_RUN_ID,
    lastEventSequence: 4,
  },
  run: {
    ...seedRun,
    status: 'running',
    startedAt: '2026-11-15T10:00:01.000Z',
  },
  events: [
    {
      id: 'evt_run_001',
      type: 'server.connected',
      sessionId: SEED_SESSION_ID,
      runId: undefined,
      sequence: 1,
      occurredAt: '2026-11-15T10:00:00.000Z',
      data: { ready: true },
    },
    {
      id: 'evt_run_002',
      type: 'run.state_changed',
      sessionId: SEED_SESSION_ID,
      runId: SEED_RUN_ID,
      sequence: 2,
      occurredAt: '2026-11-15T10:00:01.000Z',
      data: {
        previousState: 'queued',
        newState: 'running',
      },
    },
    {
      id: 'evt_run_003',
      type: 'run.delta',
      sessionId: SEED_SESSION_ID,
      runId: SEED_RUN_ID,
      sequence: 3,
      occurredAt: '2026-11-15T10:00:02.000Z',
      data: {
        delta: 'Streaming live inference tokens ',
        role: 'assistant',
      },
    },
    {
      id: 'evt_run_004',
      type: 'run.delta',
      sessionId: SEED_SESSION_ID,
      runId: SEED_RUN_ID,
      sequence: 4,
      occurredAt: '2026-11-15T10:00:03.000Z',
      data: {
        delta: 'from OpenAI-compatible provider adapter.',
        role: 'assistant',
      },
    },
  ],
  attemptReservation: {
    attemptId: 'att_seed_001',
    reservationId: 'res_seed_001',
    workspaceId: SEED_WORKSPACE_ID,
    runId: SEED_RUN_ID,
    connectionId: seedConnections[0].id,
    modelId: 'gpt-4o',
    status: 'reserved',
    tokens: {
      prompt: 150,
      completion: 45,
      total: 195,
    },
    durationMs: 1200,
  },
};

// ============================================================================
// 3. ERROR SCENARIO
// Upstream rate limit (429) & service unavailable (503) with retry-after guidance.
// ============================================================================

export interface ErrorScenarioFixture {
  name: 'error';
  rateLimitError: GatewayErrorEnvelope;
  serviceUnavailableError: GatewayErrorEnvelope;
  failedRun: GatewayRun;
  terminalEvent: GatewayEvent;
}

export const errorScenario: ErrorScenarioFixture = {
  name: 'error',
  rateLimitError: {
    code: 'rate_limited',
    message: 'Upstream model provider quota or rate limit exceeded. Please back off.',
    requestId: 'req_err_rate_limit_001',
    retryAfterSeconds: 30,
    resource: 'gpt-4o',
  },
  serviceUnavailableError: {
    code: 'service_unavailable',
    message: 'Gateway is currently starting or draining connections.',
    requestId: 'req_err_503_002',
    retryAfterSeconds: 5,
  },
  failedRun: {
    ...seedRun,
    status: 'failed',
    completedAt: '2026-11-15T10:00:05.000Z',
    error: {
      code: 'rate_limited',
      message: 'Upstream model provider quota or rate limit exceeded. Please back off.',
      requestId: 'req_err_rate_limit_001',
      retryAfterSeconds: 30,
    },
  },
  terminalEvent: {
    id: 'evt_err_005',
    type: 'run.failed',
    sessionId: SEED_SESSION_ID,
    runId: SEED_RUN_ID,
    sequence: 5,
    occurredAt: '2026-11-15T10:00:05.000Z',
    data: {
      runId: SEED_RUN_ID,
      error: {
        code: 'rate_limited',
        message: 'Upstream model provider quota or rate limit exceeded. Please back off.',
        retryAfterSeconds: 30,
      },
    },
  },
};

// ============================================================================
// 4. RECONNECT SCENARIO
// Client drops connection at sequence 2; server is at watermark 5; resync requested.
// ============================================================================

export interface ReconnectScenarioFixture {
  name: 'reconnect';
  clientCursor: number;
  serverWatermark: number;
  resyncSignalEvent: GatewayEvent;
  recoverySnapshot: RunSnapshot;
  missedEvents: GatewayEvent[];
}

export const reconnectScenario: ReconnectScenarioFixture = {
  name: 'reconnect',
  clientCursor: 2,
  serverWatermark: 5,
  resyncSignalEvent: {
    id: 'evt_resync_001',
    type: 'resync.requested',
    sessionId: SEED_SESSION_ID,
    runId: SEED_RUN_ID,
    sequence: 6,
    occurredAt: '2026-11-15T10:00:10.000Z',
    data: {
      reason: 'Client cursor is behind current journal boundary',
      expectedCursor: 2,
      latestWatermark: 5,
    },
  },
  recoverySnapshot: {
    session: {
      ...seedSession,
      activeRunId: SEED_RUN_ID,
      lastEventSequence: 5,
    },
    run: {
      ...seedRun,
      status: 'completed',
      completedAt: '2026-11-15T10:00:06.000Z',
    },
    messages: [
      ...seedUIMessages,
      {
        id: 'msg_reconstructed_03',
        role: 'assistant',
        content: 'Streaming live inference tokens from OpenAI-compatible provider adapter.',
        createdAt: '2026-11-15T10:00:06.000Z',
      },
    ],
    eventCursor: 5,
    watermark: 5,
  },
  missedEvents: [
    {
      id: 'evt_run_003',
      type: 'run.delta',
      sessionId: SEED_SESSION_ID,
      runId: SEED_RUN_ID,
      sequence: 3,
      occurredAt: '2026-11-15T10:00:02.000Z',
      data: { delta: 'Streaming live inference tokens ', role: 'assistant' },
    },
    {
      id: 'evt_run_004',
      type: 'run.delta',
      sessionId: SEED_SESSION_ID,
      runId: SEED_RUN_ID,
      sequence: 4,
      occurredAt: '2026-11-15T10:00:03.000Z',
      data: { delta: 'from OpenAI-compatible provider adapter.', role: 'assistant' },
    },
    {
      id: 'evt_run_005',
      type: 'run.completed',
      sessionId: SEED_SESSION_ID,
      runId: SEED_RUN_ID,
      sequence: 5,
      occurredAt: '2026-11-15T10:00:06.000Z',
      data: { runId: SEED_RUN_ID, finishReason: 'stop', totalTokens: 195 },
    },
  ],
};

// ============================================================================
// 5. APPROVAL SCENARIO
// Run in waiting_for_approval state with inert fixture tool action & resolution.
// ============================================================================

export interface ApprovalScenarioFixture {
  name: 'approval';
  run: GatewayRun;
  pendingApproval: GatewayApproval;
  approvalRequestedEvent: GatewayEvent;
  approvedResolution: {
    event: GatewayEvent;
    resolvedApproval: GatewayApproval;
  };
  rejectedResolution: {
    event: GatewayEvent;
    resolvedApproval: GatewayApproval;
  };
}

export const approvalScenario: ApprovalScenarioFixture = {
  name: 'approval',
  run: {
    ...seedRun,
    status: 'waiting_for_approval',
    pendingApprovalId: SEED_APPROVAL_ID,
  },
  pendingApproval: seedApproval,
  approvalRequestedEvent: {
    id: 'evt_appr_req_001',
    type: 'approval.requested',
    sessionId: SEED_SESSION_ID,
    runId: SEED_RUN_ID,
    sequence: 3,
    occurredAt: '2026-11-15T10:00:10.000Z',
    data: seedApproval,
  },
  approvedResolution: {
    event: {
      id: 'evt_appr_res_002',
      type: 'approval.resolved',
      sessionId: SEED_SESSION_ID,
      runId: SEED_RUN_ID,
      sequence: 4,
      occurredAt: '2026-11-15T10:01:00.000Z',
      data: {
        approvalId: SEED_APPROVAL_ID,
        decision: 'approved',
        actorId: 'usr_operator_01',
        reason: 'Authorized test probe against staging cluster',
      },
    },
    resolvedApproval: {
      ...seedApproval,
      status: 'approved',
      actorId: 'usr_operator_01',
      resolvedAt: '2026-11-15T10:01:00.000Z',
      reason: 'Authorized test probe against staging cluster',
    },
  },
  rejectedResolution: {
    event: {
      id: 'evt_appr_res_003',
      type: 'approval.resolved',
      sessionId: SEED_SESSION_ID,
      runId: SEED_RUN_ID,
      sequence: 4,
      occurredAt: '2026-11-15T10:01:00.000Z',
      data: {
        approvalId: SEED_APPROVAL_ID,
        decision: 'rejected',
        actorId: 'usr_operator_01',
        reason: 'Operation denied: staging cluster is undergoing maintenance',
      },
    },
    resolvedApproval: {
      ...seedApproval,
      status: 'rejected',
      actorId: 'usr_operator_01',
      resolvedAt: '2026-11-15T10:01:00.000Z',
      reason: 'Operation denied: staging cluster is undergoing maintenance',
    },
  },
};
