"use client";

import { useState, useEffect, useRef } from "react";
import { ChevronRight } from "lucide-react";
import { useConversations } from "@/hooks/use-conversations";
import { useChatStream } from "@/hooks/use-chat-stream";
import { ChatSidebar } from "@/components/chat/chat-sidebar";
import { ChatHeader } from "@/components/chat/chat-header";
import { EmptyState } from "@/components/chat/empty-state";
import { MessageItem } from "@/components/chat/message-item";
import { Composer } from "@/components/chat/composer";
import { SettingsDialog } from "@/components/block/settings-dialog";
import { gatewayRequest, MODEL_CATALOG_CHANGED } from "@/lib/gateway/client";
import type { ChatModelCatalog, ChatAttachment } from "@/types/chat";
import { cn } from "@/lib/utils";
import "./chat-workspace.css";

export function ChatWorkspace() {
  const [activeConversationId, setActiveConversationId] = useState<string | undefined>(undefined);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [model, setModel] = useState("");
  const [connectionId, setConnectionId] = useState<string | undefined>(undefined);
  const [catalog, setCatalog] = useState<ChatModelCatalog | undefined>(undefined);
  const [storageError, setStorageError] = useState<string | undefined>(undefined);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load conversations from local storage
  const {
    conversations,
    create: createConversation,
    remove: removeConversation,
    handleUpdated: handleConversationUpdated,
  } = useConversations(setStorageError);

  const selectedModel = catalog?.data?.find((entry) => entry.id === model && entry.connectionId === connectionId)
    ?? catalog?.data?.find((entry) => entry.id === catalog.defaultModel);
  const effectiveModel = selectedModel?.id ?? "";
  const effectiveConnectionId = selectedModel?.connectionId;

  // Chat streaming hook for active conversation
  const {
    messages,
    sendStatus,
    sendError,
    streamingMessageId,
    send,
    regenerate,
    stop,
  } = useChatStream({
    conversationId: activeConversationId,
    model: effectiveModel,
    connectionId: effectiveConnectionId,
    onConversationUpdated: handleConversationUpdated,
    onStorageError: setStorageError,
  });

  // Fetch model catalog from server and listen for provider changes
  useEffect(() => {
    let request: AbortController | undefined;
    async function loadCatalog() {
      request?.abort();
      const current = request = new AbortController();
      try {
        const data = await gatewayRequest<ChatModelCatalog>("/api/chat/models", { signal: current.signal });
        if (!current.signal.aborted) setCatalog(data);
      } catch {
        if (!current.signal.aborted) setCatalog(undefined);
      }
    }
    void loadCatalog();
    window.addEventListener(MODEL_CATALOG_CHANGED, loadCatalog);
    return () => {
      request?.abort();
      window.removeEventListener(MODEL_CATALOG_CHANGED, loadCatalog);
    };
  }, []);

  // Auto-scroll to bottom as new tokens arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sendStatus]);

  // Start new conversation
  const handleNewChat = () => {
    setActiveConversationId(undefined);
    setMobileSidebarOpen(false);
  };

  // Select existing conversation
  const handleSelectConversation = (id: string) => {
    setActiveConversationId(id);
    setMobileSidebarOpen(false);
  };

  const openSettings = () => {
    setMobileSidebarOpen(false);
    setSettingsOpen(true);
  };

  const toggleSidebar = () => {
    if (window.matchMedia("(min-width: 768px)").matches) {
      setSidebarOpen((open) => !open);
    } else {
      setMobileSidebarOpen((open) => !open);
    }
  };

  // Delete conversation
  const handleDeleteConversation = async (id: string) => {
    await removeConversation(id);
    if (activeConversationId === id) {
      setActiveConversationId(undefined);
    }
  };

  // Send message handler
  const handleSendMessage = async (
    text: string,
    attachments: ChatAttachment[],
    modelId?: string,
    cId?: string
  ) => {
    if (!effectiveModel) return;
    let targetId = activeConversationId;
    if (!targetId) {
      targetId = await createConversation();
      setActiveConversationId(targetId);
    }
    const targetModel = modelId || effectiveModel;
    const targetConnection = cId ?? effectiveConnectionId;
    if (modelId) setModel(modelId);
    if (cId !== undefined) setConnectionId(cId);

    await send(text, attachments, targetId, targetModel, targetConnection);
  };

  const isHome = messages.length === 0;

  return (
    <div className="kantha-chat flex h-dvh w-full flex-col overflow-hidden">
      <ChatHeader
        onNewChat={handleNewChat}
        onOpenSettings={openSettings}
        onToggleSidebar={toggleSidebar}
        sidebarOpen={sidebarOpen}
        mobileSidebarOpen={mobileSidebarOpen}
      />
      <div className="kantha-chat-body flex min-h-0 flex-1">
        <ChatSidebar
          conversations={conversations}
          activeId={activeConversationId}
          onSelect={handleSelectConversation}
          onNewChat={handleNewChat}
          onDelete={handleDeleteConversation}
          onOpenSettings={openSettings}
          isOpen={sidebarOpen}
          mobileOpen={mobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarOpen(false)}
        />
        <div className={cn("kantha-chat-canvas flex min-h-0 min-w-0 flex-1 flex-col", isHome && "kantha-chat-home")}>
          {storageError && <p role="status" className="kantha-chat-notice">{storageError}</p>}
          {sendError && <p role="status" className="kantha-chat-notice text-red-700">{sendError}</p>}

          <main className={isHome ? "kantha-chat-welcome" : "min-h-0 flex-1 overflow-y-auto px-4 pt-6 sm:px-6"}>
            {isHome ? (
              <EmptyState />
            ) : (
              <div className="mx-auto max-w-[768px] space-y-4 pb-6">
                {messages.map((msg) => (
                  <MessageItem
                    key={msg.id}
                    message={msg}
                    isStreaming={msg.id === streamingMessageId}
                    onRetry={msg.role === "assistant" ? regenerate : undefined}
                  />
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </main>

          <Composer
            onSend={handleSendMessage}
            onStop={stop}
            status={sendStatus}
            catalog={catalog}
            selectedModel={effectiveModel}
            selectedConnectionId={effectiveConnectionId}
            disabled={!effectiveModel}
            onModelSelect={(m, cId) => {
              setModel(m);
              setConnectionId(cId);
            }}
          />
          {(isHome || !effectiveModel) && (
            <footer className="kantha-chat-footer">
              <button type="button" className="kantha-chat-setup" onClick={openSettings}>
                {effectiveModel ? "Manage model providers" : "Connect a model provider to start chatting"}
                <ChevronRight size={15} aria-hidden="true" />
              </button>
            </footer>
          )}
        </div>
      </div>

      {/* Settings Dialog Overlay */}
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />
    </div>
  );
}
