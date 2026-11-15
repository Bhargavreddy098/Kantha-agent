/**
 * Valid & Invalid Test Payload Fixtures
 * For round trip schema validation and error checking across all agents.
 */

import type {
  CreateConnectionInput,
  UpdateConnectionInput,
} from '../contracts/connection';
import type { GatewayChatRequest } from '../contracts/chat';
import type { SubmitRunInput } from '../contracts/run';
import type { ResolveApprovalInput } from '../contracts/approval';
import type { GatewayEvent } from '../contracts/event';
import {
  SEED_CONNECTION_OPENAI_ID,
  SEED_SESSION_ID,
  SEED_SUBMISSION_KEY,
} from './seed-data';

// ==========================================
// VALID PAYLOADS
// ==========================================

export const validCreateConnectionPayload: CreateConnectionInput = {
  label: 'DeepSeek Production',
  endpoint: 'https://api.deepseek.com/v1',
  providerType: 'deepseek',
  apiKey: 'sk-deepseek-live-secret-test-key',
  eligibleModels: ['deepseek-chat', 'deepseek-reasoner'],
};

export const validUpdateConnectionPayload: UpdateConnectionInput = {
  label: 'DeepSeek Primary (Updated)',
  status: 'active',
  eligibleModels: ['deepseek-chat', 'deepseek-reasoner', 'deepseek-coder'],
};

export const validChatRequestPayload: GatewayChatRequest = {
  messages: [
    {
      id: 'msg_client_test_01',
      role: 'user',
      content: 'Explain idempotency in distributed gateways.',
    },
  ],
  model: 'gpt-4o',
  connectionId: SEED_CONNECTION_OPENAI_ID,
  sessionId: SEED_SESSION_ID,
  submissionKey: SEED_SUBMISSION_KEY,
  temperature: 0.7,
  maxTokens: 1024,
  stream: true,
};

export const validSubmitRunPayload: SubmitRunInput = {
  sessionId: SEED_SESSION_ID,
  submissionKey: 'subm_new_test_key_002',
  modelId: 'gpt-4o',
  connectionId: SEED_CONNECTION_OPENAI_ID,
  inputMessages: [
    {
      id: 'msg_input_01',
      role: 'user',
      content: 'Run system diagnostics on test cluster.',
    },
  ],
  system: 'You are an operations agent.',
  temperature: 0.2,
};

export const validResolveApprovalPayload: ResolveApprovalInput = {
  decision: 'approve',
  actionVersion: 1,
  reason: 'Approved by security operator',
};

export const validGatewayEventPayload: GatewayEvent = {
  id: 'evt_test_roundtrip_001',
  type: 'run.delta',
  sessionId: SEED_SESSION_ID,
  runId: 'run_exec_seed_01',
  sequence: 4,
  occurredAt: '2026-11-15T10:00:03.000Z',
  data: {
    delta: 'Gateway idempotency ensures that repeated submissions return identical results.',
    role: 'assistant',
  },
};

// ==========================================
// INVALID PAYLOADS (with expected validation error targets)
// ==========================================

export const invalidConnectionMissingLabel = {
  endpoint: 'https://api.openai.com/v1',
  providerType: 'openai',
  expectedErrorField: 'label',
};

export const invalidConnectionBadEndpoint = {
  label: 'Invalid URL Connection',
  endpoint: 'not-a-valid-url-format',
  providerType: 'openai',
  expectedErrorField: 'endpoint',
};

export const invalidConnectionBadProvider = {
  label: 'Unknown Provider',
  endpoint: 'https://api.unknown-provider.org/v1',
  providerType: 'unsupported-llm-provider',
  expectedErrorField: 'providerType',
};

export const invalidChatEmptyMessages = {
  messages: [],
  model: 'gpt-4o',
  expectedErrorField: 'messages',
};

export const invalidChatBadMessageRole = {
  messages: [
    {
      id: 'msg_bad_role',
      role: 'invalid_role_type',
      content: 'Hello',
    },
  ],
  expectedErrorField: 'messages[0].role',
};

export const invalidSubmitRunMissingSessionId = {
  submissionKey: 'subm_key_123',
  modelId: 'gpt-4o',
  inputMessages: [
    {
      id: 'msg_1',
      role: 'user',
      content: 'Hello',
    },
  ],
  expectedErrorField: 'sessionId',
};

export const invalidSubmitRunMissingKey = {
  sessionId: SEED_SESSION_ID,
  modelId: 'gpt-4o',
  inputMessages: [
    {
      id: 'msg_1',
      role: 'user',
      content: 'Hello',
    },
  ],
  expectedErrorField: 'submissionKey',
};

export const invalidApprovalBadDecision = {
  decision: 'maybe', // only approve or reject allowed
  actionVersion: 1,
  expectedErrorField: 'decision',
};

export const invalidApprovalBadVersion = {
  decision: 'approve',
  actionVersion: -1, // must be positive integer
  expectedErrorField: 'actionVersion',
};

export const invalidEventBadSequence = {
  id: 'evt_bad_seq',
  type: 'run.delta',
  sessionId: SEED_SESSION_ID,
  sequence: -5, // must be non-negative integer
  occurredAt: '2026-11-15T10:00:00.000Z',
  data: {},
  expectedErrorField: 'event.sequence',
};
