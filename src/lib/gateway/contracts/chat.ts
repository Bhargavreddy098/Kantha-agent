/**
 * Gateway Chat & Inference Contracts
 * Route endpoints:
 *   POST /api/chat
 *   POST /api/v1/chat/completions
 */

export type UIMessageRole = 'user' | 'assistant' | 'system' | 'data';

export interface UIMessagePart {
  type: string;
  text?: string;
  toolCallId?: string;
  toolName?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  [key: string]: unknown;
}

export interface UIMessage {
  id: string;
  role: UIMessageRole;
  content: string;
  parts?: UIMessagePart[];
  createdAt?: Date | string;
}

export interface GatewayChatRequest {
  messages: UIMessage[];
  model?: string;
  connectionId?: string;
  sessionId?: string;
  submissionKey?: string;
  system?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface AttemptReservation {
  attemptId: string;
  reservationId: string;
  workspaceId: string;
  connectionId: string;
  modelId: string;
  status: 'reserved' | 'settled' | 'denied' | 'refunded';
  retryCount: number;
  createdAt: string;
}

export interface ChatStreamChunk {
  type: 'text-delta' | 'tool-call' | 'finish' | 'error';
  delta?: string;
  toolCall?: {
    id: string;
    name: string;
    arguments: string;
  };
  finishReason?: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'error';
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  error?: string;
}
