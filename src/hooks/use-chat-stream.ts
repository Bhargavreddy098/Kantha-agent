"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type ChatOnFinishCallback, type UIMessage } from "ai";
import { useGatewayEvents } from "@/hooks/use-gateway-events";
import type { RunSnapshot } from "@/lib/gateway/contracts/run";
import {
  attachmentContentParts,
  readyDocuments,
  readyImages,
} from "@/lib/chat/attachments";
import * as store from "@/lib/chat/store";
import { GATEWAY_ACCESS_CHANGED, gatewayMessage, readGatewayError } from "@/lib/gateway/client";
import type { ChatAttachment, StoredMessage, SendMessageStatus } from "@/types/chat";

const PERSIST_INTERVAL_MS = 800;
const MAX_TITLE_LENGTH = 60;

export interface UseChatStreamOptions {
  conversationId: string | undefined;
  model: string;
  /** Provider connection of `model` when it comes from Settings → Model Providers. */
  connectionId?: string;
  onConversationUpdated: (id: string, patch: { title?: string }) => void;
  onStorageError: (message: string) => void;
}

function titleFromText(text: string, attachments: ChatAttachment[] | undefined): string {
  const firstLine = text.trim().split("\n")[0]?.trim() || "";
  if (firstLine) return firstLine.length > MAX_TITLE_LENGTH ? firstLine.slice(0, MAX_TITLE_LENGTH - 1) + "…" : firstLine;
  const firstAttachment = (attachments ?? []).find((a) => a.status === "ready");
  if (firstAttachment) return firstAttachment.name;
  return "New chat";
}

function outputFromMessage(message: UIMessage) {
  return {
    text: message.parts.flatMap((part) => part.type === "text" ? [part.text] : []).join(""),
    reasoning: message.parts.flatMap((part) => part.type === "reasoning" ? [part.text] : []).join("") || undefined,
  };
}

export function useChatStream({ conversationId, model, connectionId, onConversationUpdated, onStorageError }: UseChatStreamOptions) {
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [sendStatus, setSendStatus] = useState<SendMessageStatus>("idle");
  const [sendError, setSendError] = useState<string | undefined>(undefined);
  const [streamingMessageId, setStreamingMessageId] = useState<string | undefined>(undefined);

  const conversationIdRef = useRef<string | undefined>(conversationId);
  const loadedIdRef = useRef<string | undefined>(undefined);
  const modelRef = useRef(model);
  const connectionRef = useRef<string | undefined>(connectionId);
  const loadGeneration = useRef(0);
  const runningRef = useRef(false);
  // Mirror of the messages state for synchronous access inside callbacks.
  const messagesRef = useRef<StoredMessage[]>([]);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveRef = useRef<{ assistant: StoredMessage; conversationId: string } | null>(null);
  const stopRequested = useRef(false);
  const cancelling = useRef(false);
  const sdkFinish = useRef<Parameters<ChatOnFinishCallback<UIMessage>>[0] | undefined>(undefined);
  const sdkError = useRef<string | undefined>(undefined);
  const [recovery, setRecovery] = useState<StoredMessage>();

  useEffect(() => {
    modelRef.current = model;
    connectionRef.current = connectionId;
  }, [model, connectionId]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const persistLive = useCallback(async () => {
    const live = liveRef.current;
    if (!live) return;
    try {
      await store.putMessage({ ...live.assistant });
    } catch (error) {
      onStorageError(store.storageErrorMessage(error));
    }
  }, [onStorageError]);

  const schedulePersist = useCallback(() => {
    if (persistTimer.current) return;
    persistTimer.current = setTimeout(() => {
      persistTimer.current = null;
      void persistLive();
    }, PERSIST_INTERVAL_MS);
  }, [persistLive]);

  const applySnapshot = useCallback((snapshot: RunSnapshot) => {
    const run = snapshot.run;
    if (!recovery || !run || run.id !== recovery.gatewayRunId || conversationIdRef.current !== recovery.conversationId) return;
    const assistant = snapshot.messages.find((message) => message.id === `assistant_${run.id}`);
    const status = run.status === "completed" ? "complete"
      : run.status === "failed" ? "failed" : "stopped";
    const pending = run.status === "running" || run.status === "queued" || run.status === "waiting_for_approval";
    const recovered: StoredMessage = {
      ...recovery,
      text: assistant?.content ?? recovery.text,
      reasoning: assistant?.parts?.find((part) => part.type === "reasoning")?.text ?? recovery.reasoning,
      awaitingGateway: pending,
      status,
      error: pending ? undefined : run.error?.message,
    };
    setMessages((current) => current.map((message) => message.id === recovered.id ? recovered : message));
    if (!pending) {
      setRecovery(undefined);
      setSendStatus("idle");
      void store.putMessage(recovered).catch((error) => onStorageError(store.storageErrorMessage(error)));
    }
  }, [recovery, onStorageError]);

  const { cancel: cancelGatewayRun, error: recoveryError } = useGatewayEvents(recovery?.gatewaySessionId, applySnapshot);
  const cancel = useCallback(async (runId: string) => {
    if (cancelling.current) return;
    cancelling.current = true;
    try {
      await cancelGatewayRun(runId);
    } catch (error) {
      stopRequested.current = false;
      setSendError(gatewayMessage(error, "Could not stop the response. Try again."));
      setSendStatus("streaming");
    } finally {
      cancelling.current = false;
    }
  }, [cancelGatewayRun]);

  const fetchChat = useCallback<typeof fetch>(async (input, init) => {
    const response = await fetch(input, init);
    if (!response.ok) {
      if (response.status === 401) window.dispatchEvent(new Event(GATEWAY_ACCESS_CHANGED));
      throw await readGatewayError(response);
    }
    const live = liveRef.current;
    const runId = response.headers.get("x-kantha-run-id");
    const sessionId = response.headers.get("x-kantha-session-id");
    if (live && runId && sessionId) {
      live.assistant = { ...live.assistant, gatewayRunId: runId, gatewaySessionId: sessionId, awaitingGateway: true };
      await persistLive();
      if (stopRequested.current) void cancel(runId);
    }
    return response;
  }, [cancel, persistLive]);

  // The transport stores fetchChat and calls it after submission.
  // eslint-disable-next-line react-hooks/refs
  const transport = useMemo(() => new DefaultChatTransport<UIMessage>({
    api: "/api/chat",
    prepareSendMessagesRequest: ({ body }) => ({ body: body ?? {} }),
    fetch: fetchChat,
  }), [fetchChat]);

  const { sendMessage, messages: sdkMessages, setMessages: setSdkMessages, stop: stopSdk } = useChat({
    transport,
    experimental_throttle: 48,
    onError: (error) => { sdkError.current = error.message; },
    onFinish: (result) => { sdkFinish.current = result; },
  });

  useEffect(() => {
    const live = liveRef.current;
    const assistant = sdkMessages.at(-1);
    if (!live || assistant?.role !== "assistant" || live.conversationId !== conversationIdRef.current) return;
    live.assistant = { ...live.assistant, ...outputFromMessage(assistant) };
    setMessages((current) => current.map((message) => message.id === live.assistant.id ? live.assistant : message));
    if (!stopRequested.current) setSendStatus("streaming");
    schedulePersist();
  }, [sdkMessages, schedulePersist]);

  const stopPersistTimer = useCallback(() => {
    if (persistTimer.current) {
      clearTimeout(persistTimer.current);
      persistTimer.current = null;
    }
  }, []);

  useEffect(() => {
    if (conversationId === conversationIdRef.current) return;
    // A stream for the previous conversation is stopped; its partial output
    // is persisted with the old conversation before the view switches.
    if (runningRef.current) {
      void stopSdk();
    }
    conversationIdRef.current = conversationId;
    const generation = ++loadGeneration.current;
    messagesRef.current = [];
    setMessages([]);
    setRecovery(undefined);
    setSendError(undefined);
    if (!conversationId) {
      loadedIdRef.current = undefined;
      return;
    }
    const loadConversation = async () => {
      try {
        const result = await store.getConversation(conversationId);
        if (loadGeneration.current !== generation) return;
        loadedIdRef.current = conversationId;
        if (!result) {
          setMessages([]);
          return;
        }
        // Restore honestly: rows from an interrupted stream never resume as
        // if they were still streaming. Failed assistant turns are preserved so their error is visible.
        const restored = result.messages
          .map((message) => (message.status === ("streaming" as StoredMessage["status"]) ? { ...message, status: "stopped" as const } : message))
          .filter(
            (message) =>
              message.role !== "assistant" ||
              message.text.trim() !== "" ||
              (message.reasoning ?? "").trim() !== "" ||
              message.awaitingGateway ||
              message.status === "failed" ||
              Boolean(message.error),
          );
        messagesRef.current = restored;
        setMessages(restored);
        const latest = restored.at(-1);
        if (latest?.awaitingGateway) setRecovery(latest);
      } catch (error) {
        if (loadGeneration.current !== generation) return;
        loadedIdRef.current = conversationId;
        setMessages([]);
        onStorageError(store.storageErrorMessage(error));
      }
    };
    void loadConversation();
  }, [conversationId, onStorageError, stopSdk]);

  useEffect(() => () => {
    void stopSdk();
    stopPersistTimer();
  }, [stopPersistTimer, stopSdk]);

  const finalizeTurn = useCallback(
    async (status: StoredMessage["status"], error?: string, recover = false) => {
      const live = liveRef.current;
      runningRef.current = false;
      liveRef.current = null;
      setStreamingMessageId(undefined);
      setSendStatus("idle");
      stopPersistTimer();
      if (!live) return;
      const { conversationId: runConversationId } = live;
      const finished: StoredMessage = {
        ...live.assistant,
        status,
        error,
        awaitingGateway: recover,
      };
      const changed = (message: StoredMessage) => (message.id === finished.id ? finished : message);
      const stillActive = conversationIdRef.current === runConversationId;
      if (stillActive) {
        setMessages((current) => current.map(changed));
        if (recover) setRecovery(finished);
      }
      try {
        await store.putMessage(finished);
        await store.touchConversation(runConversationId, Date.now());
      } catch (storageFailure) {
        onStorageError(store.storageErrorMessage(storageFailure));
      }
      if (stillActive) onConversationUpdated(runConversationId, {});
    },
    [onConversationUpdated, onStorageError, stopPersistTimer],
  );

  const runTurn = useCallback(
    async (runConversationId: string, history: StoredMessage[], assistant: StoredMessage, sessionId?: string) => {
      runningRef.current = true;
      liveRef.current = { assistant, conversationId: runConversationId };
      sdkFinish.current = undefined;
      sdkError.current = undefined;
      setStreamingMessageId(assistant.id);
      setSendStatus("submitting");
      setSendError(undefined);

      // Existing sessions use their durable journal. New sessions import the
      // browser transcript so older conversations and regeneration still work.
      const input = sessionId ? history.slice(-1) : history;
      let imagesLeft = 6;
      const messages = [...input].reverse().flatMap((message): UIMessage[] => {
        if (message.role === "assistant" && (!message.text.trim() || message.status === "failed")) return [];
        const images = readyImages(message.attachments).slice(0, imagesLeft);
        imagesLeft -= images.length;
        const parts: UIMessage["parts"] = [
          ...(message.text ? [{ type: "text" as const, text: message.text }] : []),
          ...images.flatMap((image) => image.dataUrl ? [{
            type: "file" as const, url: image.dataUrl, mediaType: image.mimeType, filename: image.name,
          }] : []),
          ...attachmentContentParts(readyDocuments(message.attachments)).filter((part) => part.type === "text"),
        ];
        return [{ id: message.id, role: message.role, parts }];
      }).reverse();
      const user = messages.at(-1);
      if (!user || user.role !== "user") {
        await finalizeTurn("failed", "This turn has nothing to send.");
        return;
      }
      setSdkMessages([]);
      await sendMessage(user, {
        body: { messages, sessionId, submissionKey: assistant.id, model: modelRef.current, connectionId: connectionRef.current },
      });

      const finish = sdkFinish.current as Parameters<ChatOnFinishCallback<UIMessage>>[0] | undefined;
      const live = liveRef.current;
      if (live && finish?.message.role === "assistant") {
        live.assistant = { ...live.assistant, ...outputFromMessage(finish.message) };
      }
      const hasRun = Boolean(live?.assistant.gatewayRunId);
      if (finish?.isAbort && stopRequested.current) {
        await finalizeTurn("stopped");
      } else if (hasRun && (finish?.isDisconnect || finish?.isAbort || (!sdkError.current && !finish?.finishReason))) {
        await finalizeTurn("stopped", undefined, true);
      } else if (finish?.isError || sdkError.current || finish?.finishReason === "error") {
        const error = sdkError.current ?? "The provider could not complete the response.";
        await finalizeTurn("failed", error);
        setSendError(error);
      } else if (finish?.finishReason) {
        await finalizeTurn("complete");
      } else {
        await finalizeTurn("failed", "The response ended unexpectedly.");
      }
    },
    [finalizeTurn, sendMessage, setSdkMessages],
  );

  const send = useCallback(
    async (
      text: string,
      attachments: ChatAttachment[],
      conversationIdOverride?: string,
      modelOverride?: string,
      connectionIdOverride?: string,
    ): Promise<boolean> => {
      const trimmed = text.trim();
      const readyAttachments = attachments.filter((a) => a.status === "ready");
      if (runningRef.current || (recovery && !recoveryError)) return false;
      if (!trimmed && readyAttachments.length === 0) return false;
      const runConversationId = conversationIdOverride ?? conversationIdRef.current;
      if (!runConversationId || (conversationId && loadedIdRef.current !== conversationId)) return false;
      runningRef.current = true;
      stopRequested.current = false;

      // Keep refs strictly in sync immediately so re-renders of conversationId prop
      // do not treat this turn as an unexpected conversation switch and abort it.
      conversationIdRef.current = runConversationId;
      loadedIdRef.current = runConversationId;

      if (modelOverride) {
        modelRef.current = modelOverride;
      }
      if (connectionIdOverride !== undefined) {
        connectionRef.current = connectionIdOverride;
      }

      setSendError(undefined);
      const now = Date.now();
      const existing = messagesRef.current;
      const nextSeq = existing.length === 0 ? 0 : Math.max(...existing.map((m) => m.seq)) + 1;
      const user: StoredMessage = {
        id: `user_${crypto.randomUUID()}`,
        conversationId: runConversationId,
        role: "user",
        seq: nextSeq,
        createdAt: now,
        text: trimmed,
        attachments: attachments.length > 0 ? attachments : undefined,
        status: "complete",
      };
      const assistant: StoredMessage = {
        id: `assistant_${crypto.randomUUID()}`,
        conversationId: runConversationId,
        role: "assistant",
        seq: nextSeq + 1,
        createdAt: now,
        text: "",
        status: "stopped",
        model: modelRef.current,
      };

      const history = [...existing, user];
      messagesRef.current = history;
      setMessages([...history, assistant]);

      const isFirstUserMessage = existing.every((m) => m.role !== "user");
      try {
        await store.putMessages([user, assistant]);
        await store.touchConversation(runConversationId, now);
        if (isFirstUserMessage) {
          await store.renameConversation(runConversationId, titleFromText(trimmed, readyAttachments));
        }
      } catch (error) {
        onStorageError(store.storageErrorMessage(error));
      }
      onConversationUpdated(runConversationId, isFirstUserMessage ? { title: titleFromText(trimmed, readyAttachments) } : {});

      const previous = existing.at(-1);
      setRecovery(undefined);
      await runTurn(runConversationId, history, assistant, previous?.status === "complete" ? previous.gatewaySessionId : undefined);
      return true;
    },
    [conversationId, onConversationUpdated, onStorageError, recovery, recoveryError, runTurn],
  );

  const regenerate = useCallback(async (): Promise<boolean> => {
    if (runningRef.current || (recovery && !recoveryError)) return false;
    const runConversationId = conversationIdRef.current;
    if (!runConversationId || loadedIdRef.current !== runConversationId) return false;
    const existing = messagesRef.current;
    const last = existing[existing.length - 1];
    if (!last || last.role !== "assistant") return false;

    const withoutLast = existing.slice(0, -1);
    const nextSeq = withoutLast.length === 0 ? 0 : Math.max(...withoutLast.map((m) => m.seq)) + 1;
    const assistant: StoredMessage = {
      id: `assistant_${crypto.randomUUID()}`,
      conversationId: runConversationId,
      role: "assistant",
      seq: nextSeq,
      createdAt: Date.now(),
      text: "",
      status: "stopped",
      model: modelRef.current,
    };
    messagesRef.current = withoutLast;
    setMessages([...withoutLast, assistant]);
    try {
      await store.deleteMessage(last.id);
      await store.putMessage(assistant);
    } catch (error) {
      onStorageError(store.storageErrorMessage(error));
    }

    setRecovery(undefined);
    await runTurn(runConversationId, withoutLast, assistant);
    return true;
  }, [onStorageError, recovery, recoveryError, runTurn]);

  const stop = useCallback(() => {
    if (!runningRef.current && !recovery) return;
    setSendStatus("stopping");
    stopRequested.current = true;
    const runId = liveRef.current?.assistant.gatewayRunId ?? recovery?.gatewayRunId;
    if (runId) void cancel(runId);
  }, [cancel, recovery]);

  return {
    messages,
    sendStatus: recovery && !recoveryError && sendStatus === "idle" ? "streaming" as const : sendStatus,
    sendError: sendError ?? recoveryError,
    streamingMessageId: streamingMessageId ?? recovery?.id,
    send, regenerate, stop,
    clearSendError: () => setSendError(undefined),
  };
}
