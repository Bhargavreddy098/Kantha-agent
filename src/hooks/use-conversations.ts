"use client";

import { useCallback, useEffect, useState } from "react";
import * as store from "@/lib/chat/store";
import type { StoredConversation } from "@/types/chat";

/**
 * Sidebar conversation list backed by browser-local storage. Conversations
 * appear here once they contain their first message; selection lives in the
 * workspace so empty "New chat" rows are never persisted.
 */
export function useConversations(onError: (message: string) => void, owner?: string) {
  const [conversations, setConversations] = useState<StoredConversation[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const list = owner === undefined
        ? (await store.listConversations()).filter((conversation) => conversation.owner === undefined)
        : await store.listOwnedConversations(owner);
      setConversations(list);
    } catch (error) {
      onError(store.storageErrorMessage(error));
    } finally {
      setIsLoaded(true);
    }
  }, [onError, owner]);

  useEffect(() => {
    // Initial load from IndexedDB; setState happens after the async read
    // resolves, which is the external-system sync effect lint expects.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const create = useCallback(async (): Promise<string> => {
    const id = crypto.randomUUID();
    const now = Date.now();
    try {
      const conversation = { id, owner, title: "New chat", createdAt: now, updatedAt: now };
      await store.createConversation(conversation);
      setConversations((current) => [conversation, ...current]);
    } catch (error) {
      onError(store.storageErrorMessage(error));
    }
    return id;
  }, [onError, owner]);

  const rename = useCallback(
    async (id: string, title: string) => {
      const clean = title.trim().slice(0, 80) || "Untitled chat";
      try {
        await store.renameConversation(id, clean);
        setConversations((current) => current.map((c) => (c.id === id ? { ...c, title: clean } : c)));
      } catch (error) {
        onError(store.storageErrorMessage(error));
      }
    },
    [onError],
  );

  const remove = useCallback(
    async (id: string) => {
      try {
        await store.deleteConversation(id);
        setConversations((current) => current.filter((c) => c.id !== id));
      return true;
      } catch (error) {
        onError(store.storageErrorMessage(error));
      return false;
      }
    },
    [onError],
  );

  /** Called by the stream hook whenever a turn updates (or creates) a row. */
  const handleUpdated = useCallback((id: string, patch: { title?: string }) => {
    setConversations((current) => {
      const now = Date.now();
      const exists = current.some((c) => c.id === id);
      const next = exists
        ? current.map((c) =>
            c.id === id ? { ...c, title: patch.title ?? c.title, updatedAt: now } : c,
          )
        : [
            {
              id,
              owner,
              title: patch.title ?? "New chat",
              createdAt: now,
              updatedAt: now,
            },
            ...current,
          ];
      return [...next].sort((a, b) => b.updatedAt - a.updatedAt);
    });
  }, [owner]);

  return { conversations, isLoaded, refresh, create, rename, remove, handleUpdated };
}
