"use client";

import type { StoredConversation, StoredMessage } from "@/types/chat";

/**
 * Browser-local conversation store (IndexedDB).
 *
 * Stores the browser copy of conversations and attachments. The gateway
 * journals sent content separately. Credentials never enter this store.
 */

const DB_NAME = "kantha-chat";
const DB_VERSION = 2;
const CONVERSATIONS = "conversations";
const MESSAGES = "messages";

export class ChatStorageError extends Error {
  readonly kind: "unavailable" | "quota" | "failed";
  constructor(kind: ChatStorageError["kind"], message: string, cause?: unknown) {
    super(message, { cause });
    this.kind = kind;
  }
}

let connection: Promise<IDBDatabase> | undefined;

function openDatabase(): Promise<IDBDatabase> {
  const pending = connection ??= connect();
  void pending.catch(() => {
    if (connection === pending) connection = undefined;
  });
  return pending;
}

function connect(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new ChatStorageError("unavailable", "IndexedDB is not available in this browser."));
      return;
    }
    
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (e) {
      reject(new ChatStorageError("unavailable", "IndexedDB could not be opened.", e));
      return;
    }
    
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CONVERSATIONS)) {
        const store = db.createObjectStore(CONVERSATIONS, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
      }
      
      const convStore = request.transaction!.objectStore(CONVERSATIONS);
      if (!convStore.indexNames.contains('owner_updatedAt')) {
        convStore.createIndex('owner_updatedAt', ['owner', 'updatedAt']);
      }
      
      if (!db.objectStoreNames.contains(MESSAGES)) {
        const store = db.createObjectStore(MESSAGES, { keyPath: "id" });
        store.createIndex("conversation_seq", ["conversationId", "seq"]);
      }
    };
    
    let blocked = false;
    request.onsuccess = () => {
      const db = request.result;
      if (blocked) {
        db.close();
        return;
      }
      db.onversionchange = () => {
        connection = undefined;
        db.close();
      };
      db.onclose = () => { connection = undefined; };
      resolve(db);
    };
    
    request.onerror = () => {
      const error = request.error;
      const isQuotaError = error?.name === "QuotaExceededError";
      reject(
        new ChatStorageError(
          isQuotaError ? "quota" : "unavailable",
          isQuotaError 
            ? "Browser storage is full. Delete older conversations to free space." 
            : "IndexedDB could not be opened.",
          error
        ),
      );
    };
    
    request.onblocked = () => {
      blocked = true;
      reject(new ChatStorageError("unavailable", "IndexedDB is blocked by another tab."));
    };
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(wrapError(request.error));
  });
}

function wrapError(error: unknown): ChatStorageError {
  if (error instanceof ChatStorageError) return error;
  
  const name = (error as { name?: string } | null)?.name;
  if (name === "QuotaExceededError") {
    return new ChatStorageError("quota", "Browser storage is full. Delete older conversations to free space.", error);
  }
  return new ChatStorageError("failed", "Browser storage operation failed.", error);
}

async function withStore<T>(
  stores: readonly string[],
  mode: IDBTransactionMode,
  run: (tx: IDBTransaction) => T | Promise<T>,
): Promise<T> {
  const db = await openDatabase();
  
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    let result: T;
    
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(wrapError(tx.error));
    tx.onerror = () => reject(wrapError(tx.error));

    void (async () => {
      try {
        result = await run(tx);
      } catch (error) {
        try {
          tx.abort();
        } catch {
          // Already aborted.
        }
        reject(wrapError(error));
      }
    })();
  });
}

function messageSort(a: StoredMessage, b: StoredMessage) {
  return a.seq - b.seq;
}

export async function listConversations(): Promise<StoredConversation[]> {
  const conversations = await withStore([CONVERSATIONS], "readonly", (tx) =>
    requestToPromise(tx.objectStore(CONVERSATIONS).getAll() as IDBRequest<StoredConversation[]>),
  );
  return conversations.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function listOwnedConversations(owner: string): Promise<StoredConversation[]> {
  return withStore([CONVERSATIONS], "readonly", async (tx) => {
    const index = tx.objectStore(CONVERSATIONS).index("owner_updatedAt");
    const rows = await requestToPromise(index.getAll(
      IDBKeyRange.bound([owner, -Infinity], [owner, Infinity]),
    ) as IDBRequest<StoredConversation[]>);
    return rows.reverse();
  });
}

export async function getConversation(
  id: string,
): Promise<{ conversation: StoredConversation; messages: StoredMessage[] } | null> {
  return withStore([CONVERSATIONS, MESSAGES], "readonly", async (tx) => {
    const conversation = await requestToPromise(
      tx.objectStore(CONVERSATIONS).get(id) as IDBRequest<StoredConversation | undefined>,
    );
    if (!conversation) return null;
    const index = tx.objectStore(MESSAGES).index("conversation_seq");
    const messages = await requestToPromise(
      index.getAll(IDBKeyRange.bound([id, -Infinity], [id, Infinity])) as IDBRequest<StoredMessage[]>,
    );
    return { conversation, messages: messages.sort(messageSort) };
  });
}

export async function createConversation(conversation: StoredConversation): Promise<void> {
  await withStore([CONVERSATIONS], "readwrite", (tx) => {
    tx.objectStore(CONVERSATIONS).put(conversation);
  });
}

export async function renameConversation(id: string, title: string): Promise<void> {
  await withStore([CONVERSATIONS], "readwrite", async (tx) => {
    const conversation = await requestToPromise(
      tx.objectStore(CONVERSATIONS).get(id) as IDBRequest<StoredConversation | undefined>,
    );
    if (!conversation) return;
    tx.objectStore(CONVERSATIONS).put({ ...conversation, title, updatedAt: Date.now() });
  });
}

export async function touchConversation(id: string, updatedAt: number): Promise<void> {
  await withStore([CONVERSATIONS], "readwrite", async (tx) => {
    const conversation = await requestToPromise(
      tx.objectStore(CONVERSATIONS).get(id) as IDBRequest<StoredConversation | undefined>,
    );
    if (!conversation) return;
    tx.objectStore(CONVERSATIONS).put({ ...conversation, updatedAt });
  });
}

export async function deleteConversation(id: string): Promise<void> {
  await withStore([CONVERSATIONS, MESSAGES], "readwrite", async (tx) => {
    const index = tx.objectStore(MESSAGES).index("conversation_seq");
    const range = IDBKeyRange.bound([id, -Infinity], [id, Infinity]);
    const keys = await requestToPromise(index.getAllKeys(range) as IDBRequest<IDBValidKey[]>);
    const store = tx.objectStore(MESSAGES);
    for (const key of keys) store.delete(key);
    tx.objectStore(CONVERSATIONS).delete(id);
  });
}

export async function putMessage(message: StoredMessage): Promise<void> {
  await withStore([MESSAGES], "readwrite", (tx) => {
    tx.objectStore(MESSAGES).put(message);
  });
}

export async function putMessages(messages: StoredMessage[]): Promise<void> {
  if (messages.length === 0) return;
  await withStore([MESSAGES], "readwrite", (tx) => {
    const store = tx.objectStore(MESSAGES);
    for (const message of messages) store.put(message);
  });
}

export async function deleteMessage(id: string): Promise<void> {
  await withStore([MESSAGES], "readwrite", (tx) => {
    tx.objectStore(MESSAGES).delete(id);
  });
}

export function storageErrorMessage(error: unknown, fallback = "Browser storage is unavailable."): string {
  if (error instanceof ChatStorageError) return error.message;
  if (error instanceof DOMException && error.name === "QuotaExceededError") {
    return "Browser storage is full. Delete older conversations to free space.";
  }
  return fallback;
}

/** Reads every conversation with its messages, for the local export feature. */
export async function exportAllConversations(): Promise<
  Array<StoredConversation & { messages: StoredMessage[] }>
> {
  const conversations = await listConversations();
  const loadedList = await Promise.all(
    conversations.map(async (conversation) => {
      const loaded = await getConversation(conversation.id);
      return loaded ? { ...loaded.conversation, messages: loaded.messages } : null;
    }),
  );
  return loadedList.filter((item): item is StoredConversation & { messages: StoredMessage[] } => item !== null);
}
