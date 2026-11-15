/**
 * Gateway Runtime Validation & Schemas
 * Pure TypeScript runtime schema validators returning typed data or GatewayErrorEnvelope.
 */

import type { GatewayErrorEnvelope } from './errors';
import type { CreateConnectionInput, UpdateConnectionInput } from './connection';
import type { CreateSessionInput } from './session';
import type { GatewayChatRequest, UIMessage } from './chat';
import type { SubmitRunInput } from './run';
import type { ResolveApprovalInput } from './approval';
import type { GatewayEvent } from './event';

const PROVIDERS = ['openai', 'anthropic', 'groq', 'openrouter', 'ollama', 'deepseek', 'together', 'custom'];

export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: GatewayErrorEnvelope };

function fail(field: string, message: string, requestId = 'req_validation'): { ok: false; error: GatewayErrorEnvelope } {
  return {
    ok: false,
    error: {
      code: 'invalid_request',
      message: `Validation failed: ${message}`,
      field,
      requestId,
    },
  };
}

export function validateCreateConnectionInput(raw: unknown, requestId?: string): ValidationResult<CreateConnectionInput> {
  if (!raw || typeof raw !== 'object') {
    return fail('body', 'Expected JSON object in request body', requestId);
  }
  const obj = raw as Record<string, unknown>;

  if (typeof obj.label !== 'string' || !obj.label.trim() || obj.label.trim().length > 100) {
    return fail('label', 'Label is required and must be a non-empty string', requestId);
  }

  if (typeof obj.endpoint !== 'string' || !obj.endpoint.trim()) {
    return fail('endpoint', 'Endpoint URL is required', requestId);
  }

  try {
    const parsedUrl = new URL(obj.endpoint.trim());
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return fail('endpoint', 'Endpoint must have http or https protocol', requestId);
    }
  } catch {
    return fail('endpoint', 'Endpoint must be a valid URL', requestId);
  }

  if (typeof obj.providerType !== 'string' || !PROVIDERS.includes(obj.providerType)) {
    return fail('providerType', `Provider type must be one of: ${PROVIDERS.join(', ')}`, requestId);
  }

  if (obj.apiKey !== undefined && (typeof obj.apiKey !== 'string' || obj.apiKey.length > 4096 || /[\r\n]/.test(obj.apiKey))) {
    return fail('apiKey', 'Use a single-line API key of up to 4096 characters', requestId);
  }

  if (obj.eligibleModels !== undefined) {
    if (!Array.isArray(obj.eligibleModels) || !obj.eligibleModels.every((m) => typeof m === 'string')) {
      return fail('eligibleModels', 'eligibleModels must be an array of strings', requestId);
    }
  }

  return {
    ok: true,
    data: {
      label: obj.label.trim(),
      endpoint: obj.endpoint.trim(),
      providerType: obj.providerType as CreateConnectionInput['providerType'],
      apiKey: typeof obj.apiKey === 'string' ? obj.apiKey.trim() : undefined,
      eligibleModels: Array.isArray(obj.eligibleModels) ? obj.eligibleModels : undefined,
    },
  };
}

export function validateUpdateConnectionInput(raw: unknown, requestId?: string): ValidationResult<UpdateConnectionInput> {
  if (!raw || typeof raw !== 'object') {
    return fail('body', 'Expected JSON object in request body', requestId);
  }
  const obj = raw as Record<string, unknown>;

  const data: UpdateConnectionInput = {};

  if (obj.label !== undefined) {
    if (typeof obj.label !== 'string' || !obj.label.trim() || obj.label.trim().length > 100) {
      return fail('label', 'Label must be a non-empty string', requestId);
    }
    data.label = obj.label.trim();
  }

  if (obj.endpoint !== undefined) {
    if (typeof obj.endpoint !== 'string' || !obj.endpoint.trim()) {
      return fail('endpoint', 'Endpoint must be a non-empty string', requestId);
    }
    try {
      new URL(obj.endpoint.trim());
    } catch {
      return fail('endpoint', 'Endpoint must be a valid URL', requestId);
    }
    data.endpoint = obj.endpoint.trim();
  }

  if (obj.status !== undefined) {
    const validStatuses = ['active', 'inactive', 'testing', 'error', 'revoked'];
    if (typeof obj.status !== 'string' || !validStatuses.includes(obj.status)) {
      return fail('status', `Status must be one of: ${validStatuses.join(', ')}`, requestId);
    }
    data.status = obj.status as UpdateConnectionInput['status'];
  }

  if (obj.providerType !== undefined) {
    if (typeof obj.providerType !== 'string' || !PROVIDERS.includes(obj.providerType)) {
      return fail('providerType', 'Select a supported provider type', requestId);
    }
    data.providerType = obj.providerType as UpdateConnectionInput['providerType'];
  }

  if (obj.apiKey !== undefined) {
    if (typeof obj.apiKey !== 'string' || obj.apiKey.length > 4096 || /[\r\n]/.test(obj.apiKey)) {
      return fail('apiKey', 'Use a single-line API key of up to 4096 characters', requestId);
    }
    data.apiKey = obj.apiKey.trim();
  }

  if (obj.eligibleModels !== undefined) {
    if (!Array.isArray(obj.eligibleModels) || !obj.eligibleModels.every((m) => typeof m === 'string')) {
      return fail('eligibleModels', 'eligibleModels must be an array of strings', requestId);
    }
    data.eligibleModels = obj.eligibleModels;
  }

  return { ok: true, data };
}

export function validateUIMessage(raw: unknown, index: number, requestId?: string): ValidationResult<UIMessage> {
  if (!raw || typeof raw !== 'object') {
    return fail(`messages[${index}]`, 'Each message must be an object', requestId);
  }
  const msg = raw as Record<string, unknown>;

  if (typeof msg.id !== 'string' || !msg.id.trim()) {
    return fail(`messages[${index}].id`, 'Message id is required', requestId);
  }

  const validRoles = ['user', 'assistant', 'system'];
  if (typeof msg.role !== 'string' || !validRoles.includes(msg.role)) {
    return fail(`messages[${index}].role`, `Role must be one of: ${validRoles.join(', ')}`, requestId);
  }

  const parts: NonNullable<UIMessage['parts']> = [];
  if (Array.isArray(msg.parts)) {
    for (const item of msg.parts) {
      if (item && (item.type === 'text' || item.type === 'reasoning') && typeof item.text === 'string') {
        parts.push({ type: item.type, text: item.text });
      }
    }
  }
  const textParts = parts.filter((part) => part.type === 'text');
  if (!textParts.length && typeof msg.content !== 'string') {
    return fail(`messages[${index}].content`, 'Content must be a string', requestId);
  }

  return {
    ok: true,
    data: {
      id: msg.id,
      role: msg.role as UIMessage['role'],
      content: textParts.length ? textParts.map((part) => part.text).join('') : String(msg.content),
      parts: parts.length ? parts : undefined,
    },
  };
}

export function validateGatewayChatRequest(raw: unknown, requestId?: string): ValidationResult<GatewayChatRequest> {
  if (!raw || typeof raw !== 'object') {
    return fail('body', 'Expected JSON object in request body', requestId);
  }
  const obj = raw as Record<string, unknown>;

  if ('baseUrl' in obj || 'apiKey' in obj) {
    return fail('connectionId', 'Use a saved provider connection', requestId);
  }

  if (!Array.isArray(obj.messages) || obj.messages.length === 0 || obj.messages.length > 500) {
    return fail('messages', 'Messages array is required and cannot be empty', requestId);
  }

  const validatedMessages: UIMessage[] = [];
  for (let i = 0; i < obj.messages.length; i++) {
    const res = validateUIMessage(obj.messages[i], i, requestId);
    if (!res.ok) return res;
    validatedMessages.push(res.data);
  }

  return {
    ok: true,
    data: {
      messages: validatedMessages,
      model: typeof obj.model === 'string' ? obj.model : undefined,
      connectionId: typeof obj.connectionId === 'string' ? obj.connectionId : undefined,
      sessionId: typeof obj.sessionId === 'string' ? obj.sessionId : undefined,
      submissionKey: typeof obj.submissionKey === 'string' ? obj.submissionKey : undefined,
      system: typeof obj.system === 'string' ? obj.system : undefined,
      temperature: typeof obj.temperature === 'number' ? obj.temperature : undefined,
      maxTokens: typeof obj.maxTokens === 'number' ? obj.maxTokens : undefined,
      stream: typeof obj.stream === 'boolean' ? obj.stream : true,
    },
  };
}

export function validateCreateSessionInput(raw: unknown, requestId?: string): ValidationResult<CreateSessionInput> {
  if (raw === undefined || raw === null) {
    return { ok: true, data: {} };
  }
  if (typeof raw !== 'object') {
    return fail('body', 'Expected JSON object in request body', requestId);
  }
  const obj = raw as Record<string, unknown>;

  if (obj.title !== undefined && (typeof obj.title !== 'string' || !obj.title.trim())) {
    return fail('title', 'Title must be a non-empty string if provided', requestId);
  }
  if (obj.workspaceId !== undefined && typeof obj.workspaceId !== 'string') {
    return fail('workspaceId', 'workspaceId must be a string if provided', requestId);
  }

  return {
    ok: true,
    data: {
      title: typeof obj.title === 'string' ? obj.title.trim() : undefined,
      workspaceId: typeof obj.workspaceId === 'string' ? obj.workspaceId.trim() : undefined,
      metadata: typeof obj.metadata === 'object' && obj.metadata !== null ? (obj.metadata as Record<string, unknown>) : undefined,
    },
  };
}

export function validateSubmitRunInput(raw: unknown, requestId?: string): ValidationResult<SubmitRunInput> {
  if (!raw || typeof raw !== 'object') {
    return fail('body', 'Expected JSON object in request body', requestId);
  }
  const obj = raw as Record<string, unknown>;

  if (typeof obj.sessionId !== 'string' || !obj.sessionId.trim()) {
    return fail('sessionId', 'sessionId is required', requestId);
  }
  if (typeof obj.submissionKey !== 'string' || !obj.submissionKey.trim()) {
    return fail('submissionKey', 'submissionKey is required for idempotency', requestId);
  }
  if (typeof obj.modelId !== 'string' || !obj.modelId.trim()) {
    return fail('modelId', 'modelId is required', requestId);
  }
  if (!Array.isArray(obj.inputMessages) || obj.inputMessages.length === 0) {
    return fail('inputMessages', 'inputMessages array is required and cannot be empty', requestId);
  }

  const validatedMessages: UIMessage[] = [];
  for (let i = 0; i < obj.inputMessages.length; i++) {
    const res = validateUIMessage(obj.inputMessages[i], i, requestId);
    if (!res.ok) return res;
    validatedMessages.push(res.data);
  }

  return {
    ok: true,
    data: {
      sessionId: obj.sessionId.trim(),
      submissionKey: obj.submissionKey.trim(),
      modelId: obj.modelId.trim(),
      connectionId: typeof obj.connectionId === 'string' ? obj.connectionId.trim() : undefined,
      inputMessages: validatedMessages,
      system: typeof obj.system === 'string' ? obj.system : undefined,
      temperature: typeof obj.temperature === 'number' ? obj.temperature : undefined,
      maxTokens: typeof obj.maxTokens === 'number' ? obj.maxTokens : undefined,
    },
  };
}

export function validateResolveApprovalInput(raw: unknown, requestId?: string): ValidationResult<ResolveApprovalInput> {
  if (!raw || typeof raw !== 'object') {
    return fail('body', 'Expected JSON object in request body', requestId);
  }
  const obj = raw as Record<string, unknown>;

  if (obj.decision !== 'approve' && obj.decision !== 'reject') {
    return fail('decision', 'Decision must be either "approve" or "reject"', requestId);
  }
  if (typeof obj.actionVersion !== 'number' || !Number.isInteger(obj.actionVersion) || obj.actionVersion < 1) {
    return fail('actionVersion', 'actionVersion must be a positive integer', requestId);
  }

  return {
    ok: true,
    data: {
      decision: obj.decision,
      actionVersion: obj.actionVersion,
      reason: typeof obj.reason === 'string' ? obj.reason : undefined,
    },
  };
}

export function validateGatewayEvent(raw: unknown, requestId?: string): ValidationResult<GatewayEvent> {
  if (!raw || typeof raw !== 'object') {
    return fail('event', 'Expected JSON event object', requestId);
  }
  const obj = raw as Record<string, unknown>;

  if (typeof obj.id !== 'string' || !obj.id.trim()) {
    return fail('event.id', 'Event id is required', requestId);
  }
  if (typeof obj.type !== 'string' || !obj.type.trim()) {
    return fail('event.type', 'Event type is required', requestId);
  }
  if (typeof obj.sessionId !== 'string' || !obj.sessionId.trim()) {
    return fail('event.sessionId', 'Event sessionId is required', requestId);
  }
  if (typeof obj.sequence !== 'number' || !Number.isInteger(obj.sequence) || obj.sequence < 0) {
    return fail('event.sequence', 'Event sequence must be a non-negative integer', requestId);
  }
  if (typeof obj.occurredAt !== 'string' || !obj.occurredAt.trim()) {
    return fail('event.occurredAt', 'Event occurredAt ISO timestamp is required', requestId);
  }

  return {
    ok: true,
    data: {
      id: obj.id,
      type: obj.type as GatewayEvent['type'],
      sessionId: obj.sessionId,
      runId: typeof obj.runId === 'string' ? obj.runId : undefined,
      sequence: obj.sequence,
      occurredAt: obj.occurredAt,
      data: obj.data,
    },
  };
}
