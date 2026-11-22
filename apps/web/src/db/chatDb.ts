import Dexie, { type Table } from "dexie";

export interface StoredAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  dataUrl?: string; // base64 preview for images
  extractedText?: string; // extracted text for documents
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  model?: string;
}

export interface StoredMessage {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  reasoning?: string;
  attachments?: StoredAttachment[];
  timestamp: number;
  status?: "complete" | "streaming" | "error";
}

export class KanthaSwissChatDatabase extends Dexie {
  conversations!: Table<Conversation, string>;
  messages!: Table<StoredMessage, string>;

  constructor() {
    super("KanthaSwissChatDB");

    this.version(1).stores({
      conversations: "id, createdAt, updatedAt",
      messages: "id, conversationId, role, timestamp",
    });
  }
}

export const chatDb = new KanthaSwissChatDatabase();
