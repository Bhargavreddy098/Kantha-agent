/**
 * Canonical Event Contract for Chat
 * Focused exclusively on Text and Reasoning message parts.
 */

export interface TextPart {
  type: "text";
  id?: string;
  text: string;
}

export interface ReasoningPart {
  type: "reasoning";
  id?: string;
  text: string;
  isStreaming?: boolean;
}

export type AgentPart = TextPart | ReasoningPart;

export interface AgentMessage {
  id: string;
  role: "user" | "assistant" | "system";
  createdAt?: Date;
  parts: AgentPart[];
}
