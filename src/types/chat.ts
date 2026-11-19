/** OpenAI-compatible message content part. */
export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "auto" | "low" | "high" } };

export type AttachmentKind = "image" | "document";

export type AttachmentStatus = "processing" | "ready" | "failed";

/**
 * A locally processed attachment. Image content is retained as a data URL
 * so follow-up requests can resend real bytes; document content is the
 * text extracted by /api/upload. Sent content is retained in the gateway run journal.
 */
export interface ChatAttachment {
  id: string;
  kind: AttachmentKind;
  name: string;
  mimeType: string;
  size: number;
  status: AttachmentStatus;
  /** Image payload as `data:image/...;base64,...` (images only). */
  dataUrl?: string;
  /** Extracted text (documents only). */
  text?: string;
  /** True when the extracted text was cut off by the server limit. */
  truncated?: boolean;
  /** Set when processing or upload failed; the attachment is not sent. */
  error?: string;
}

/** A locally persisted chat message. */
export interface StoredMessage {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  /** Persisted sequence within the conversation, used for stable ordering. */
  seq: number;
  createdAt: number;
  /** Final-answer text. */
  text: string;
  /** Returned reasoning, when the provider streamed any. */
  reasoning?: string;
  /** User messages: attachments retained for follow-up questions. */
  attachments?: ChatAttachment[];
  status: "complete" | "stopped" | "failed";
  /** Safe error description for failed messages. */
  error?: string;
  /** Model that produced an assistant message. */
  model?: string;
  gatewaySessionId?: string;
  gatewayRunId?: string;
  awaitingGateway?: boolean;
}

/** A locally persisted conversation. */
export interface StoredConversation {
  id: string;
  owner?: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export type SendMessageStatus = "idle" | "submitting" | "streaming" | "stopping";

/** Model entries returned by /api/chat/models (never includes credentials). */
export interface ChatModelCatalog {
  models: string[];
  data?: { id: string; name: string; provider: string; connectionId: string }[];
  defaultModel: string;
  source: "connections" | "default";
  /** Present when no connection has eligible models. */
  warning?: string;
}

/**
 * A selectable model in the chat header. Models from Settings → Model
 * Providers carry their provider connection so the gateway routes the turn
 * to exactly that connection.
 */
export interface ChatModelOption {
  id: string;
  connectionId?: string;
  /** Provider type label, e.g. "openai", "deepseek", "custom". */
  provider?: string;
}
