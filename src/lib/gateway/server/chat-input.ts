import { createHash, randomUUID } from 'node:crypto';
import type { UIMessage } from '../contracts/chat';
import type { RequestContext } from '../contracts/context';
import { GatewayError } from '../contracts/errors';

const DEFAULT_MAX_OUTPUT_TOKENS = 2048;
const MAX_OUTPUT_TOKENS = 8192;

function invalidChat(ctx: RequestContext, message: string, field?: string): never {
  throw new GatewayError({ code: 'invalid_request', message, field, requestId: ctx.requestId });
}

function readOptionalChatString(
  body: Record<string, unknown>,
  field: string,
  ctx: RequestContext,
  maxLength = 256
): string | undefined {
  const value = body[field];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength || value.includes('\0')) {
    return invalidChat(ctx, `Invalid ${field}.`, field);
  }
  return value.trim();
}

function readTextMessage(value: unknown, fallbackId: string, ctx: RequestContext): UIMessage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return invalidChat(ctx, 'Each chat message must be an object.', 'messages');
  }
  const message = value as Record<string, unknown>;
  if (message.role !== 'user' && message.role !== 'assistant') {
    return invalidChat(ctx, 'Chat accepts user and assistant text messages.', 'messages');
  }

  const rawParts = message.parts ?? (Array.isArray(message.content) ? message.content : undefined);
  const text = typeof message.content === 'string' ? message.content : message.text;
  const parts: NonNullable<UIMessage['parts']> = [];
  if (rawParts !== undefined) {
    if (!Array.isArray(rawParts) || rawParts.length > 16) {
      return invalidChat(ctx, 'Supply up to 16 content parts per message.', 'messages');
    }
    for (const raw of rawParts) {
      const part = raw as { type?: string; text?: unknown; url?: unknown; image_url?: { url?: unknown } } | null;
      if (part?.type === 'text' && typeof part.text === 'string' && part.text.length <= 300_000) {
        parts.push({ type: 'text', text: part.text });
      } else if (message.role === 'user' && (part?.type === 'file' || part?.type === 'image_url')) {
        const url = part.type === 'file' ? part.url : part.image_url?.url;
        if (typeof url !== 'string' || url.length > 8_000_000 ||
            !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(url)) {
          return invalidChat(ctx, 'Images must be PNG, JPEG or WebP data URLs.', 'messages');
        }
        parts.push({ type: 'file', url });
      } else {
        return invalidChat(ctx, 'Unsupported chat content part.', 'messages');
      }
    }
  } else if (typeof text === 'string' && text.length <= 300_000) {
    parts.push({ type: 'text', text });
  } else {
    return invalidChat(ctx, 'Supply valid message content.', 'messages');
  }

  const content = parts.map((part) => part.text ?? '').join('');
  if (message.role === 'user' && !content.trim() && !parts.some((part) => part.type === 'file')) {
    return invalidChat(ctx, 'A user message must contain text or an image.', 'messages');
  }
  if (message.id !== undefined && (typeof message.id !== 'string' || !message.id.trim() || message.id.length > 256)) {
    return invalidChat(ctx, 'Invalid message ID.', 'messages');
  }

  return {
    id: typeof message.id === 'string' ? message.id : fallbackId,
    role: message.role,
    content,
    parts,
  };
}

export function readChatInput(raw: unknown, ctx: RequestContext, sessionPath?: string) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return invalidChat(ctx, 'A JSON chat request is required.');
  }
  const body = raw as Record<string, unknown>;
  if ('baseUrl' in body || 'apiKey' in body || 'endpoint' in body) {
    return invalidChat(ctx, 'Use a configured provider connection for chat.', 'connectionId');
  }

  const sessionId = sessionPath ?? readOptionalChatString(body, 'sessionId', ctx);
  const submissionKey = readOptionalChatString(body, 'submissionKey', ctx);
  const modelId = readOptionalChatString(body, sessionPath ? 'modelId' : 'model', ctx);
  const connectionId = readOptionalChatString(body, 'connectionId', ctx);
  const system = readOptionalChatString(body, 'system', ctx, 8192);
  const temperature = body.temperature;
  const maxTokens = body.maxTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
  if (
    typeof maxTokens !== 'number' ||
    !Number.isInteger(maxTokens) ||
    maxTokens < 1 ||
    maxTokens > MAX_OUTPUT_TOKENS
  ) {
    return invalidChat(ctx, `maxTokens must be between 1 and ${MAX_OUTPUT_TOKENS}.`, 'maxTokens');
  }
  if (
    temperature !== undefined &&
    (typeof temperature !== 'number' || !Number.isFinite(temperature) || temperature < 0 || temperature > 2)
  ) {
    return invalidChat(ctx, 'temperature must be between 0 and 2.', 'temperature');
  }

  const rawMessages: unknown = sessionPath ? body.inputMessages : body.messages;
  if (!Array.isArray(rawMessages) || rawMessages.length === 0 || rawMessages.length > 500) {
    return invalidChat(ctx, 'Supply between 1 and 500 chat messages.', 'messages');
  }
  if (sessionPath && (!submissionKey || !modelId)) {
    return invalidChat(ctx, 'A submission key and model ID are required for this run.');
  }

  // Existing sessions take their history from the journal. Only the new user turn comes from the client.
  const incoming = sessionId ? rawMessages.slice(-1) : rawMessages;
  const fallbackId = submissionKey
    ? `message_${createHash('sha256').update(submissionKey).digest('hex').slice(0, 32)}`
    : `message_${randomUUID()}`;
  const inputMessages = incoming.map((value, index) =>
    readTextMessage(value, `${fallbackId}_${index}`, ctx)
  );
  if (inputMessages.flatMap((message) => message.parts ?? []).filter((part) => part.type === 'file').length > 6) {
    return invalidChat(ctx, 'At most six images can be sent in a chat request.', 'messages');
  }
  const lastMessage = inputMessages[inputMessages.length - 1];
  if (lastMessage.role !== 'user') {
    return invalidChat(ctx, 'The last chat message must be from the user.', 'messages');
  }

  return {
    connectionId,
    modelId,
    sessionId,
    submissionKey: submissionKey ?? lastMessage.id,
    inputMessages,
    system,
    temperature,
    maxTokens,
  };
}
