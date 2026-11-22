import { useLiveQuery } from "dexie-react-hooks";
import { chatDb, type Conversation, type StoredMessage } from "./chatDb";

export interface GroupedConversations {
  today: Conversation[];
  yesterday: Conversation[];
  previous7Days: Conversation[];
  older: Conversation[];
}

/**
 * Categorizes conversations by chronological groups: Today, Yesterday, Previous 7 Days, Older.
 */
export function groupConversationsByDate(
  conversations: Conversation[]
): GroupedConversations {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const startOfYesterday = startOfToday - ONE_DAY_MS;
  const startOfSevenDays = startOfToday - 6 * ONE_DAY_MS;

  const grouped: GroupedConversations = {
    today: [],
    yesterday: [],
    previous7Days: [],
    older: [],
  };

  for (const conv of conversations) {
    const time = conv.updatedAt || conv.createdAt;
    if (time >= startOfToday) {
      grouped.today.push(conv);
    } else if (time >= startOfYesterday) {
      grouped.yesterday.push(conv);
    } else if (time >= startOfSevenDays) {
      grouped.previous7Days.push(conv);
    } else {
      grouped.older.push(conv);
    }
  }

  // Sort each group descending by latest activity
  grouped.today.sort((a, b) => b.updatedAt - a.updatedAt);
  grouped.yesterday.sort((a, b) => b.updatedAt - a.updatedAt);
  grouped.previous7Days.sort((a, b) => b.updatedAt - a.updatedAt);
  grouped.older.sort((a, b) => b.updatedAt - a.updatedAt);

  return grouped;
}

/**
 * Generates a clean concise conversation title from user's first prompt.
 */
export function generateConversationTitle(prompt: string): string {
  const cleaned = prompt.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 40) {
    return cleaned;
  }
  return cleaned.slice(0, 37) + "...";
}

/**
 * Creates a new conversation in Dexie IndexedDB.
 */
export async function createConversation(title = "New Exploration"): Promise<string> {
  const id = `conv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const now = Date.now();
  await chatDb.conversations.add({
    id,
    title,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

/**
 * Renames an existing conversation.
 */
export async function renameConversation(id: string, newTitle: string): Promise<void> {
  await chatDb.conversations.update(id, {
    title: newTitle.trim(),
    updatedAt: Date.now(),
  });
}

/**
 * Deletes a conversation and all its associated messages.
 */
export async function deleteConversation(id: string): Promise<void> {
  await chatDb.transaction("rw", chatDb.conversations, chatDb.messages, async () => {
    await chatDb.conversations.delete(id);
    await chatDb.messages.where("conversationId").equals(id).delete();
  });
}

/**
 * Saves or updates a message in the active conversation.
 */
export async function saveMessage(message: StoredMessage): Promise<void> {
  await chatDb.transaction("rw", chatDb.conversations, chatDb.messages, async () => {
    await chatDb.messages.put(message);
    await chatDb.conversations.update(message.conversationId, {
      updatedAt: Date.now(),
    });
  });
}

/**
 * Updates partial message state (e.g. streaming tokens, reasoning, status).
 */
export async function updateMessage(
  id: string,
  updates: Partial<StoredMessage>
): Promise<void> {
  await chatDb.messages.update(id, updates);
}

/**
 * Reactive hook to list all conversations, optionally filtered by search term.
 */
export function useConversations(searchQuery = ""): Conversation[] {
  const list = useLiveQuery(
    async () => {
      const all = await chatDb.conversations.orderBy("updatedAt").reverse().toArray();
      if (!searchQuery.trim()) return all;
      const lower = searchQuery.toLowerCase();
      return all.filter((c) => c.title.toLowerCase().includes(lower));
    },
    [searchQuery],
    []
  );

  return list || [];
}

/**
 * Reactive hook to retrieve messages for a specific conversation in ascending chronological order.
 */
export function useMessages(conversationId: string | null): StoredMessage[] {
  const messages = useLiveQuery(
    async () => {
      if (!conversationId) return [];
      return await chatDb.messages
        .where("conversationId")
        .equals(conversationId)
        .sortBy("timestamp");
    },
    [conversationId],
    []
  );

  return messages || [];
}
