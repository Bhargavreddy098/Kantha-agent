"use client";

import dynamic from "next/dynamic";
import NextLink from "next/link";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, RotateCcw, Paperclip, ThumbsUp, ThumbsDown, Trash2, Sparkles } from "lucide-react";
import { useGatewayAccess } from "@/components/gateway/gateway-access-gate";
import { HarnessRunPanel } from "@/components/harness/harness-run-panel";
import { useAIProvider } from "@/hooks/use-ai-provider";
import { useChatStream } from "@/hooks/use-chat-stream";
import { useConversations } from "@/hooks/use-conversations";
import { ACCEPTED_FILE_TYPES, MAX_FILES_PER_MESSAGE, fetchUploadLimits, processFile } from "@/lib/chat/attachments";
import { MODEL_CATALOG_CHANGED } from "@/lib/gateway/client";
import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Center } from "@astryxdesign/core/Center";
import { ChatComposer, ChatComposerDrawer, ChatLayout, ChatMessage, ChatMessageBubble, ChatMessageList, ChatSendButton, ChatMessageMetadata } from "@astryxdesign/core/Chat";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { Drawer, DrawerHeader } from "@astryxdesign/core/Drawer";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { IconButton } from "@astryxdesign/core/IconButton";
import { useClipboard } from "@astryxdesign/core/hooks";
import { Link } from "@astryxdesign/core/Link";
import { Selector } from "@astryxdesign/core/Selector";
import { SideNav, SideNavItem, SideNavSection } from "@astryxdesign/core/SideNav";
import { Stack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import type { StoredConversation, StoredMessage } from "@/types/chat";

const Markdown = dynamic(() => import("@astryxdesign/core/Markdown").then((module) => module.Markdown), {
  loading: () => null,
});
const HISTORY_PAGE_SIZE = 30;

const ConversationMessage = memo(function ConversationMessage({ message, streaming, onRetry }: {
  message: StoredMessage;
  streaming: boolean;
  onRetry?: () => void;
}) {
  const clipboard = useClipboard({ announce: "Copied" });
  const [copyFailed, setCopyFailed] = useState(false);
  const assistant = message.role === "assistant";
  const canCopy = assistant && Boolean(message.text) && !streaming;
  const actions = (canCopy || onRetry) && (
    <ChatMessageMetadata>
      <Stack direction="horizontal" align="center" wrap="wrap" gap={2}>
        {canCopy && <IconButton label="Copy response" icon={<Copy className="h-4 w-4" />}
          size="sm" variant="ghost" onClick={async () => {
            setCopyFailed(!await clipboard.copy(message.text));
          }} />}
        {onRetry && <IconButton label="Retry response" icon={<RotateCcw className="h-4 w-4" />}
          size="sm" variant="ghost" onClick={onRetry} />}
        <IconButton label="Good response" icon={<ThumbsUp className="h-4 w-4" />} size="sm" variant="ghost" />
        <IconButton label="Bad response" icon={<ThumbsDown className="h-4 w-4" />} size="sm" variant="ghost" />
        {clipboard.isCopied && <Text>Copied</Text>}
        {copyFailed && <Text role="status">Could not copy</Text>}
      </Stack>
    </ChatMessageMetadata>
  );
  return (
    <ChatMessage sender={message.role}>
      <ChatMessageBubble name="" metadata={actions}>
        <VStack gap={2}>
          {message.reasoning && (
            <Collapsible trigger={<Text>Reasoning</Text>} defaultIsOpen={false}>
              <Markdown>{message.reasoning}</Markdown>
            </Collapsible>
          )}
          {message.attachments?.map((file) => (
            <Stack key={file.id} direction="horizontal" align="center" gap={1}>
              <Paperclip className="h-4 w-4" />
              <Badge label={file.name} />
            </Stack>
          ))}
          {message.text && <Markdown isStreaming={streaming}>{message.text}</Markdown>}
          {streaming && !message.text && <Text role="status">Waiting for a response…</Text>}
          {message.error && <Banner status="error" title={message.error} />}
          {assistant && !streaming && !message.error && message.status === "stopped" && <Text>Response stopped.</Text>}
        </VStack>
      </ChatMessageBubble>
    </ChatMessage>
  );
});

function rememberedConversation(key: string) {
  try {
    return sessionStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

function shortModelName(label: string) {
  const disambiguation = label.match(/\s\(([^()]*)\)$/);
  const name = disambiguation ? label.slice(0, -disambiguation[0].length) : label;
  const short = (name.split("/").pop() ?? name).replace(/:(free|preview|latest)$/i, "");
  return short + (disambiguation ? disambiguation[0] : "");
}

export function ChatView() {
  const access = useGatewayAccess();
  const owner = JSON.stringify([access?.workspaceId, access?.actorId]);
  const selectionKey = "kantha:chat:" + owner;
  const [selection, setSelection] = useState(() => rememberedConversation(selectionKey));
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLimit, setHistoryLimit] = useState(HISTORY_PAGE_SIZE);
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyFilter, setHistoryFilter] = useState("");
  const [removeTarget, setRemoveTarget] = useState<StoredConversation>();
  const [removing, setRemoving] = useState(false);
  const [storageError, setStorageError] = useState<string>();
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [draftError, setDraftError] = useState<string>();
  const submission = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { conversations, isLoaded, create, remove, handleUpdated } = useConversations(setStorageError, owner);
  useEffect(() => {
    const timeout = setTimeout(() => {
      setHistoryFilter(historyQuery.trim().toLowerCase());
      setHistoryLimit(HISTORY_PAGE_SIZE);
    }, 150);
    return () => clearTimeout(timeout);
  }, [historyQuery]);

  const matchingHistory = useMemo(() => historyFilter
    ? conversations.filter(({ title }) => title.toLowerCase().includes(historyFilter))
    : conversations, [conversations, historyFilter]);
  const conversationId = conversations.find(({ id }) => id === selection)?.id;
  const currentConversation = conversations.find(({ id }) => id === conversationId);
  const catalog = useAIProvider();
  const modelOptions = useMemo(() => catalog.modelOptions.map((option) => ({
    ...option,
    label: shortModelName(option.label),
    description: option.label,
  })), [catalog.modelOptions]);
  const chat = useChatStream({
    conversationId,
    model: catalog.selected?.id ?? "",
    connectionId: catalog.selected?.connectionId,
    onConversationUpdated: handleUpdated,
    onStorageError: setStorageError,
  });

  const { regenerate } = chat;
  const retryResponse = useCallback(() => { void regenerate(); }, [regenerate]);
  const running = chat.sendStatus !== "idle";
  const busy = running || preparing;
  const gatewaySessionId = useMemo(() => {
    for (let index = chat.messages.length - 1; index >= 0; index -= 1) {
      const id = chat.messages[index].gatewaySessionId;
      if (id) return id;
    }
    return undefined;
  }, [chat.messages]);
  const canSend = Boolean(isLoaded && catalog.selected && !catalog.loading && !busy && (draft.trim() || files.length));

  function selectConversation(id?: string) {
    setSelection(id);
    setHistoryOpen(false);
    setDraft("");
    setFiles([]);
    setDraftError(undefined);
    try {
      if (id) sessionStorage.setItem(selectionKey, id);
      else sessionStorage.removeItem(selectionKey);
    } catch {
      // Conversation selection remains available without session storage.
    }
  }

  async function submit(text: string) {
    const model = catalog.selected;
    if (submission.current || !isLoaded || !model || catalog.loading || running || (!text.trim() && !files.length)) return;
    submission.current = true;
    setPreparing(true);
    setDraftError(undefined);
    try {
      const limits = files.length ? await fetchUploadLimits() : undefined;
      const attachments = limits ? await Promise.all(files.map((file) => processFile(file, limits))) : [];
      const failed = attachments.find((file) => file.status === "failed");
      if (failed) {
        setDraftError(failed.name + " — " + failed.error);
        setDraft(text);
        return;
      }

      const id = conversationId ?? await create();
      if (!conversationId) {
        // Mark the conversation before sending, including when browser persistence fails.
        handleUpdated(id, {});
        selectConversation(id);
      }
      const accepted = await chat.send(text, attachments, id, model.id, model.connectionId);
      if (accepted) {
        setDraft("");
        setFiles([]);
      } else {
        setDraft(text);
        setFiles(files);
        setDraftError("The conversation is still loading. Try sending again.");
      }
    } catch {
      setDraft(text);
      setFiles(files);
      setDraftError("The message could not be sent. Try again.");
    } finally {
      submission.current = false;
      setPreparing(false);
    }
  }

  async function deleteConversation() {
    if (!removeTarget || removing) return;
    setRemoving(true);
    try {
      if (await remove(removeTarget.id)) {
        if (conversationId === removeTarget.id) selectConversation();
        setRemoveTarget(undefined);
      }
    } finally {
      setRemoving(false);
    }
  }

  const composer = (
    <VStack gap={2} width="100%">
      {catalog.error && <Banner status="error" role="alert" title={catalog.error} endContent={
        <Button label="Retry model loading" variant="secondary" size="sm"
          onClick={() => window.dispatchEvent(new Event(MODEL_CATALOG_CHANGED))} />
      } />}
      {!catalog.loading && !catalog.error && !catalog.selected && (
        <Banner status="info" title="A model is required to chat"
          description={access?.roles?.includes("owner")
            ? <Link as={NextLink} href="/settings#model-providers">Connect a model provider</Link>
            : "Ask a workspace owner to configure a model provider."} />
      )}
      {draftError && <Banner status="error" role="alert" title={draftError} />}
      {chat.sendError && <Banner status="error" role="alert" title={chat.sendError} />}
      <ChatComposer
        value={draft}
        onChange={setDraft}
        onSubmit={(text) => void submit(text)}
        placeholder="Message Kantha"
        isDisabled={!isLoaded || busy || !catalog.selected || catalog.loading}
        isStopShown={running}
        onStop={chat.stop}
        headerActions={
          <IconButton label="Attach files" icon={<Paperclip className="h-4 w-4" />}
            variant="ghost" size="sm" tooltip="Attach files"
            isDisabled={busy || !catalog.selected} onClick={() => fileInputRef.current?.click()} />
        }
        footerActions={
          <Selector label="Model" options={modelOptions} value={catalog.selectedKey}
            onChange={catalog.setSelectedModel} isDisabled={busy || !catalog.modelOptions.length}
            isLoading={catalog.loading} size="sm" variant="secondary" isLabelHidden
            startIcon={<Sparkles className="h-3.5 w-3.5" />}
            hasSearch searchPlaceholder="Search models" width={240} />
        }
        drawer={files.length ? (
          <ChatComposerDrawer count={files.length} label="Attachments" defaultIsCollapsed={false}>
            <Stack direction="horizontal" gap={1} wrap="wrap">
              {files.map((file, index) => (
                <Token key={file.name + index} label={file.name} size="sm"
                  icon={<Paperclip className="h-3 w-3" />}
                  onRemove={() => setFiles((current) => current.filter((_, position) => position !== index))} />
              ))}
            </Stack>
          </ChatComposerDrawer>
        ) : undefined}
        sendButton={chat.sendStatus === "stopping"
          ? <Button label="Stopping…" isLoading variant="secondary" size="sm" />
          : <ChatSendButton isStopShown={running} onStop={chat.stop} isDisabled={!canSend} onSend={() => void submit(draft)} />}
      />
      <input ref={fileInputRef} type="file" hidden multiple accept={ACCEPTED_FILE_TYPES}
        onChange={(event) => {
          const picked = Array.from(event.target.files ?? []);
          if (picked.length) setFiles((current) => [...current, ...picked].slice(0, MAX_FILES_PER_MESSAGE));
          event.target.value = "";
        }} />
    </VStack>
  );

  return (
    <Center axis="horizontal" width="100%" height="100%">
      <VStack gap={2} padding={4} width="100%" maxWidth={900} height="100%">
        <Stack direction="horizontal" gap={3} wrap="wrap" align="center" justify="between">
          <Heading level={1}>Chat</Heading>
          <Stack direction="horizontal" gap={2} wrap="wrap">
            <Button label="History" variant="secondary" onClick={() => setHistoryOpen(true)} />
            <Button label="New chat" variant="secondary" isDisabled={busy} onClick={() => selectConversation()} />
            <IconButton label="Delete current chat" icon={<Trash2 className="h-4 w-4" />}
              variant="ghost" size="sm" tooltip="Delete current chat"
              isDisabled={busy || !currentConversation} onClick={() => currentConversation && setRemoveTarget(currentConversation)} />
          </Stack>
        </Stack>
        {storageError && <Banner status="warning" role="status" title={storageError} />}
        <ChatLayout composer={composer} emptyState={<EmptyState title="Start a conversation" headingLevel={2} />}>
          {chat.messages.length > 0 && (
            <ChatMessageList isStreaming={running}>
              {chat.messages.map((message, index) => (
                <ConversationMessage key={message.id} message={message} streaming={message.id === chat.streamingMessageId}
                  onRetry={catalog.selected && message.role === "assistant" && index === chat.messages.length - 1 && !busy
                    ? retryResponse : undefined} />
              ))}
            </ChatMessageList>
          )}
        </ChatLayout>
        <Collapsible trigger={<Text>Harness task</Text>} defaultIsOpen={false}>
          <HarnessRunPanel sessionId={gatewaySessionId} />
        </Collapsible>
        <Drawer side="start" label="Conversation history" isOpen={historyOpen} onOpenChange={setHistoryOpen}>
          <DrawerHeader title="Conversation history" onOpenChange={setHistoryOpen} />
          <TextInput label="Search conversations" type="search" value={historyQuery}
            onChange={setHistoryQuery} enterKeyHint="search" />
          <SideNav aria-label="Conversation history">
            <SideNavSection title="Recent conversations">
              {historyOpen && matchingHistory.slice(0, historyLimit).map((item) => (
                <SideNavItem key={item.id} label={item.title} isSelected={item.id === conversationId}
                  isDisabled={busy} onClick={() => selectConversation(item.id)}
                  actions={<IconButton label={"Delete " + item.title} icon={<Trash2 className="h-4 w-4" />}
                    variant="ghost" size="sm" tooltip="Delete chat"
                    isDisabled={busy} onClick={() => setRemoveTarget(item)} />} />
              ))}
            </SideNavSection>
            {historyOpen && matchingHistory.length > historyLimit && (
              <Button label="Load older conversations" variant="secondary"
                onClick={() => setHistoryLimit((limit) => limit + HISTORY_PAGE_SIZE)} />
            )}
            {conversations.length > 0 && matchingHistory.length === 0 && <Text role="status">No matching conversations.</Text>}
            {conversations.length === 0 && <Text>{isLoaded ? "No conversations yet." : "Loading conversations…"}</Text>}
          </SideNav>
        </Drawer>
        <AlertDialog isOpen={Boolean(removeTarget)} onOpenChange={(open) => { if (!open && !removing) setRemoveTarget(undefined); }}
          title="Delete conversation?" description="This removes the conversation and its attachments from this browser."
          actionLabel="Delete conversation" actionVariant="destructive" isActionLoading={removing} onAction={deleteConversation} />
      </VStack>
    </Center>
  );
}
