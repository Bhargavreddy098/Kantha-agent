/**
 * Deterministic Seeded Test Data
 * Fixed IDs, timestamps, and entities for Kantha Gateway test harnesses and preview.
 */

import type { GatewayConnection } from '../contracts/connection';
import type { GatewayModel } from '../contracts/model';
import type { GatewaySession } from '../contracts/session';
import type { GatewayRun } from '../contracts/run';
import type { GatewayApproval } from '../contracts/approval';
import type { GatewayUsageSummary } from '../contracts/usage';
import type { RequestContext } from '../contracts/context';
import type { GatewayEvent } from '../contracts/event';
import type { UIMessage } from '../contracts/chat';

export const SEED_WORKSPACE_ID = 'ws_kantha_seed_01';
export const SEED_USER_ID = 'usr_kantha_seed_01';
export const SEED_CONNECTION_OPENAI_ID = 'conn_openai_seed_01';
export const SEED_CONNECTION_GROQ_ID = 'conn_groq_seed_02';
export const SEED_SESSION_ID = 'ses_chat_seed_01';
export const SEED_RUN_ID = 'run_exec_seed_01';
export const SEED_SUBMISSION_KEY = 'subm_turn_seed_01';
export const SEED_APPROVAL_ID = 'appr_tool_seed_01';
export const SEED_TIMESTAMP = '2026-11-15T10:00:00.000Z';

export const seedRequestContext: RequestContext = {
  requestId: 'req_seed_001',
  workspaceId: SEED_WORKSPACE_ID,
  caller: {
    type: 'user',
    id: SEED_USER_ID,
    name: 'Operator User',
    roles: ['admin', 'member'],
  },
  timestamp: 1794736800000,
  directory: '/workspaces/kantha-project',
  capabilities: ['experimental-media-uri', 'stream-v2'],
  clientIp: '127.0.0.1',
  userAgent: 'Kantha-Agent-Harness/1.0',
};

export const seedConnections: GatewayConnection[] = [
  {
    id: SEED_CONNECTION_OPENAI_ID,
    workspaceId: SEED_WORKSPACE_ID,
    label: 'OpenAI Primary',
    endpoint: 'https://api.openai.com/v1',
    providerType: 'openai',
    status: 'active',
    secretRef: 'sec_vault_openai_primary',
    eligibleModels: ['gpt-4o', 'gpt-4o-mini'],
    createdAt: '2026-11-15T09:00:00.000Z',
    updatedAt: '2026-11-15T09:00:00.000Z',
    lastTestedAt: '2026-11-15T09:05:00.000Z',
  },
  {
    id: SEED_CONNECTION_GROQ_ID,
    workspaceId: SEED_WORKSPACE_ID,
    label: 'Groq High-Speed',
    endpoint: 'https://api.groq.com/openai/v1',
    providerType: 'groq',
    status: 'active',
    secretRef: 'sec_vault_groq_primary',
    eligibleModels: ['llama-3.3-70b-versatile'],
    createdAt: '2026-11-15T09:10:00.000Z',
    updatedAt: '2026-11-15T09:10:00.000Z',
    lastTestedAt: '2026-11-15T09:12:00.000Z',
  },
];

export const seedModels: GatewayModel[] = [
  {
    id: 'gpt-4o',
    connectionId: SEED_CONNECTION_OPENAI_ID,
    name: 'GPT-4o Omnimodal',
    provider: 'openai',
    contextWindow: 128000,
    maxTokens: 4096,
    capabilities: {
      chat: true,
      reasoning: true,
      tools: true,
      vision: true,
      streaming: true,
    },
    pricing: {
      promptPerMillion: 2.5,
      completionPerMillion: 10.0,
      currency: 'USD',
    },
    isDefault: true,
    status: 'available',
    description: 'Flagship multimodal intelligence for high-reasoning tasks',
  },
  {
    id: 'gpt-4o-mini',
    connectionId: SEED_CONNECTION_OPENAI_ID,
    name: 'GPT-4o Mini',
    provider: 'openai',
    contextWindow: 128000,
    maxTokens: 4096,
    capabilities: {
      chat: true,
      reasoning: false,
      tools: true,
      vision: true,
      streaming: true,
    },
    pricing: {
      promptPerMillion: 0.15,
      completionPerMillion: 0.6,
      currency: 'USD',
    },
    isDefault: false,
    status: 'available',
    description: 'Fast, lightweight and cost-effective model for routine tasks',
  },
  {
    id: 'llama-3.3-70b-versatile',
    connectionId: SEED_CONNECTION_GROQ_ID,
    name: 'Llama 3.3 70B Versatile',
    provider: 'groq',
    contextWindow: 131072,
    maxTokens: 8192,
    capabilities: {
      chat: true,
      reasoning: true,
      tools: true,
      vision: false,
      streaming: true,
    },
    pricing: {
      promptPerMillion: 0.59,
      completionPerMillion: 0.79,
      currency: 'USD',
    },
    isDefault: false,
    status: 'available',
    description: 'Ultra-low latency inference via Groq LPU engine',
  },
];

export const seedUIMessages: UIMessage[] = [
  {
    id: 'msg_seed_01',
    role: 'user',
    content: 'Please summarize our current gateway deployment plan.',
    createdAt: '2026-11-15T09:59:00.000Z',
  },
  {
    id: 'msg_seed_02',
    role: 'assistant',
    content: 'The gateway deployment follows an 8-slice staged architecture with strict contract isolation.',
    createdAt: '2026-11-15T09:59:30.000Z',
  },
];

export const seedSession: GatewaySession = {
  id: SEED_SESSION_ID,
  workspaceId: SEED_WORKSPACE_ID,
  title: 'Gateway Architecture Session',
  status: 'active',
  activeRunId: undefined,
  lastEventSequence: 2,
  createdAt: '2026-11-15T09:58:00.000Z',
  updatedAt: '2026-11-15T09:59:30.000Z',
  metadata: {
    project: 'kantha-agent',
    env: 'production',
  },
};

export const seedRun: GatewayRun = {
  id: SEED_RUN_ID,
  sessionId: SEED_SESSION_ID,
  workspaceId: SEED_WORKSPACE_ID,
  submissionKey: SEED_SUBMISSION_KEY,
  status: 'queued',
  modelId: 'gpt-4o',
  connectionId: SEED_CONNECTION_OPENAI_ID,
  startedAt: '2026-11-15T10:00:00.000Z',
  metadata: {
    origin: 'chat_composer',
  },
};

export const seedApproval: GatewayApproval = {
  id: SEED_APPROVAL_ID,
  runId: SEED_RUN_ID,
  sessionId: SEED_SESSION_ID,
  workspaceId: SEED_WORKSPACE_ID,
  actionVersion: 1,
  toolName: 'inert_fixture_tool',
  summary: 'Execute inert probe against test cluster',
  parameters: {
    action: 'execute_test_probe',
    target: 'staging-cluster',
    dryRun: true,
  },
  status: 'waiting',
  createdAt: '2026-11-15T10:00:10.000Z',
  expiresAt: '2026-11-15T10:15:10.000Z',
};

export const seedUsageSummary: GatewayUsageSummary = {
  workspaceId: SEED_WORKSPACE_ID,
  window: {
    start: '2026-11-15T00:00:00.000Z',
    end: '2026-11-15T23:59:59.999Z',
  },
  freshness: 'fresh',
  totals: {
    promptTokens: 1420,
    completionTokens: 480,
    totalTokens: 1900,
    estimatedCostUsd: 0.00835,
    totalRequests: 5,
  },
  limits: {
    maxDailyTokens: 100000,
    maxDailyBudgetUsd: 10.0,
    currentTokensUsed: 1900,
    currentBudgetUsdUsed: 0.00835,
    isExceeded: false,
  },
  byModel: {
    'gpt-4o': {
      promptTokens: 1200,
      completionTokens: 400,
      totalTokens: 1600,
      requests: 3,
      estimatedCostUsd: 0.007,
    },
    'llama-3.3-70b-versatile': {
      promptTokens: 220,
      completionTokens: 80,
      totalTokens: 300,
      requests: 2,
      estimatedCostUsd: 0.00135,
    },
  },
  lastUpdatedAt: '2026-11-15T10:00:00.000Z',
};

export const seedEvents: GatewayEvent[] = [
  {
    id: 'evt_seed_001',
    type: 'server.connected',
    sessionId: SEED_SESSION_ID,
    runId: undefined,
    sequence: 1,
    occurredAt: '2026-11-15T10:00:00.000Z',
    data: { ready: true },
  },
  {
    id: 'evt_seed_002',
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
    id: 'evt_seed_003',
    type: 'run.delta',
    sessionId: SEED_SESSION_ID,
    runId: SEED_RUN_ID,
    sequence: 3,
    occurredAt: '2026-11-15T10:00:02.000Z',
    data: {
      delta: 'Hello! I am Kantha Gateway.',
      role: 'assistant',
    },
  },
];
