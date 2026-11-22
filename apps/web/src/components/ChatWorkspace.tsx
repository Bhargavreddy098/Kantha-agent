import React, { useState, useEffect, useRef, useCallback } from "react";
import { AppShell, ChatLayout, ChatMessageList, IconButton } from "@astryxdesign/core";
import { Settings } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { Sidebar } from "./Sidebar";
import { WelcomeScreen } from "./WelcomeScreen";
import { MessageItem } from "./MessageItem";
import { Composer } from "./Composer";
import { SettingsDialog } from "./SettingsDialog";
import { safeJson, type ProvidersDataResponse } from "../services/providerService";
import {
  useConversations,
  useMessages,
  createConversation,
  renameConversation,
  saveMessage,
  updateMessage,
  generateConversationTitle,
} from "../db/useChatHistory";
import { chatDb, type StoredMessage, type StoredAttachment } from "../db/chatDb";
import { streamChatResponse } from "../services/chatStreamService";

export const ChatWorkspace: React.FC = () => {
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [themeMode, setThemeMode] = useState<"light" | "dark">("light");
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeAssistantMsgId, setActiveAssistantMsgId] = useState<string | null>(null);
  const [modelStatus, setModelStatus] = useState<string>("Connecting...");
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [providersData, setProvidersData] = useState<ProvidersDataResponse | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    return localStorage.getItem("kantha_selected_model") || "openai:gpt-4o";
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const conversations = useConversations();
  const messages = useMessages(activeConversationId);
  const allMessageCount = useLiveQuery(() => chatDb.messages.count()) || 0;

  // Apply theme data attribute to document body
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", themeMode);
  }, [themeMode]);

  const refreshProviders = useCallback(() => {
    fetch("/api/providers", { credentials: "include" })
      .then((res) => safeJson<ProvidersDataResponse>(res))
      .then((data: ProvidersDataResponse) => {
        if (!data) return;
        setIsOnline(true);
        setProvidersData(data);
        const saved = localStorage.getItem("kantha_selected_model");
        const activeModel = saved || data.defaultModel || "openai:gpt-4o";
        setSelectedModel(activeModel);

        const all =
          data.providers?.flatMap((p) =>
            p.models.map((m) => ({ ...m, fullId: `${p.id}:${m.id}` }))
          ) || [];
        const match = all.find((m) => m.fullId === activeModel || m.id === activeModel);
        const displayName =
          match?.name ||
          (activeModel.includes(":") ? activeModel.slice(activeModel.indexOf(":") + 1) : activeModel);
        setModelStatus(`Connected: ${displayName}`);
      })
      .catch(() => {
        setIsOnline(false);
        setModelStatus("Ready: Local Model Engine");
      });
  }, []);

  // Establish ADR-007 session handshake and discover daemon providers
  useEffect(() => {
    fetch("/api/auth/handshake", { credentials: "include" })
      .then(() => refreshProviders())
      .catch(() => refreshProviders());
  }, [refreshProviders]);

  // Sync active conversation with list to prevent orphaned zombie states
  useEffect(() => {
    if (conversations.length > 0) {
      if (!activeConversationId || !conversations.some((c) => c.id === activeConversationId)) {
        setActiveConversationId(conversations[0].id);
      }
    } else {
      setActiveConversationId(null);
    }
  }, [conversations, activeConversationId]);

  const handleToggleTheme = () => {
    setThemeMode((prev) => (prev === "light" ? "dark" : "light"));
  };

  const resolveModelDisplayName = (modelId: string) => {
    const all = providersData?.providers?.flatMap((p) =>
      p.models.map((m) => ({ ...m, fullId: `${p.id}:${m.id}` }))
    ) || [];
    const match = all.find((m) => m.fullId === modelId || m.id === modelId);
    if (match) return match.name;
    for (const p of providersData?.providers || []) {
      if (modelId.startsWith(`${p.id}:`)) {
        return modelId.slice(p.id.length + 1);
      }
    }
    return modelId;
  };

  const handleSelectModel = (modelId: string) => {
    setSelectedModel(modelId);
    localStorage.setItem("kantha_selected_model", modelId);
    setModelStatus(`Connected: ${resolveModelDisplayName(modelId)}`);
    if (activeConversationId) {
      chatDb.conversations.update(activeConversationId, { model: modelId, updatedAt: Date.now() });
    }
  };

  // Restore active conversation's specific model if saved
  useEffect(() => {
    if (activeConversationId) {
      const active = conversations.find((c) => c.id === activeConversationId);
      if (active?.model) {
        setSelectedModel(active.model);
        setModelStatus(`Connected: ${resolveModelDisplayName(active.model)}`);
      }
    }
  }, [activeConversationId, conversations, providersData]);

  const handleClearAllHistory = async () => {
    await chatDb.messages.clear();
    await chatDb.conversations.clear();
    setActiveConversationId(null);
  };

  const handleNewChat = async () => {
    if (isGenerating && abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const newId = await createConversation();
    setActiveConversationId(newId);
  };

  const handleSendMessage = async (text: string, attachments: StoredAttachment[]) => {
    let convId = activeConversationId;

    // Auto-create new conversation if none selected
    if (!convId) {
      const generatedTitle = generateConversationTitle(text || attachments[0]?.name || "New Chat");
      convId = await createConversation(generatedTitle);
      setActiveConversationId(convId);
    } else {
      // If current conversation has no messages yet, update title to match first prompt
      if (messages.length === 0) {
        const generatedTitle = generateConversationTitle(text || attachments[0]?.name || "New Chat");
        await renameConversation(convId, generatedTitle);
      }
    }

    const now = Date.now();
    const userMsgId = `msg_${now}_${Math.random().toString(36).substring(2, 7)}`;
    const userMessage: StoredMessage = {
      id: userMsgId,
      conversationId: convId,
      role: "user",
      content: text,
      attachments: attachments.length > 0 ? attachments : undefined,
      timestamp: now,
      status: "complete",
    };

    await saveMessage(userMessage);

    // Prepare assistant response shell
    const assistantMsgId = `msg_${now + 1}_${Math.random().toString(36).substring(2, 7)}`;
    const assistantMessage: StoredMessage = {
      id: assistantMsgId,
      conversationId: convId,
      role: "assistant",
      content: "",
      reasoning: "",
      timestamp: now + 1,
      status: "streaming",
    };

    await saveMessage(assistantMessage);
    setActiveAssistantMsgId(assistantMsgId);
    setIsGenerating(true);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    let accumulatedContent = "";
    let accumulatedReasoning = "";

    const fullHistory = [...messages, userMessage];

    let targetProviderId: string | undefined;
    for (const p of providersData?.providers || []) {
      if (selectedModel.startsWith(`${p.id}:`)) {
        targetProviderId = p.id;
        break;
      }
    }

    await streamChatResponse({
      messages: fullHistory,
      model: selectedModel,
      providerId: targetProviderId,
      signal: abortController.signal,
      onToken: async (delta) => {
        accumulatedContent += delta;
        await updateMessage(assistantMsgId, {
          content: accumulatedContent,
        });
      },
      onReasoning: async (delta) => {
        accumulatedReasoning += delta;
        await updateMessage(assistantMsgId, {
          reasoning: accumulatedReasoning,
        });
      },
      onError: async (error) => {
        setIsGenerating(false);
        setActiveAssistantMsgId(null);
        await updateMessage(assistantMsgId, {
          status: "error",
          content: accumulatedContent || `Stream error: ${error.message}`,
        });
      },
      onComplete: async () => {
        setIsGenerating(false);
        setActiveAssistantMsgId(null);
        await updateMessage(assistantMsgId, {
          status: "complete",
          content: accumulatedContent,
          reasoning: accumulatedReasoning,
        });
      },
    });
  };

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsGenerating(false);
      if (activeAssistantMsgId) {
        updateMessage(activeAssistantMsgId, { status: "complete" });
        setActiveAssistantMsgId(null);
      }
    }
  };

  const handleRegenerate = async () => {
    if (isGenerating || messages.length === 0) return;

    // Find last user message
    const lastUserIndex = messages.map((m) => m.role).lastIndexOf("user");
    if (lastUserIndex === -1) return;

    const lastUserMsg = messages[lastUserIndex];
    handleSendMessage(lastUserMsg.content, lastUserMsg.attachments || []);
  };

  const activeConversation = conversations.find((c) => c.id === activeConversationId);

  return (
    <AppShell
      variant="section"
      height="fill"
      sideNav={
        <Sidebar
          activeConversationId={activeConversationId}
          onSelectConversation={setActiveConversationId}
          onNewChat={handleNewChat}
          themeMode={themeMode}
          onToggleTheme={handleToggleTheme}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />
      }
      topNav={
        <div
          style={{
            height: "52px",
            padding: "0 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: "var(--swiss-surface)",
            borderBottom: "1px solid var(--swiss-border)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span
              style={{
                fontSize: "14px",
                fontWeight: 600,
                color: "var(--swiss-text)",
                letterSpacing: "-0.01em",
              }}
            >
              {activeConversation ? activeConversation.title : "Kantha Swiss Intelligence"}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span
                style={{
                  display: "inline-block",
                  width: "7px",
                  height: "7px",
                  borderRadius: "50%",
                  backgroundColor: isOnline ? "#10B981" : "var(--swiss-accent)",
                }}
              />
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--swiss-text-secondary)",
                }}
              >
                {modelStatus}
              </span>
            </div>

            <IconButton
              icon={<Settings size={15} />}
              label="Settings"
              variant="ghost"
              size="sm"
              onClick={() => setIsSettingsOpen(true)}
            />
          </div>
        </div>
      }
    >
      <div
        ref={scrollContainerRef}
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "var(--swiss-bg)",
        }}
      >
        <ChatLayout
          density="balanced"
          composer={
            <Composer
              onSubmit={handleSendMessage}
              onStop={handleStopGeneration}
              isGenerating={isGenerating}
              selectedModel={selectedModel}
              onSelectModel={handleSelectModel}
              providersData={providersData}
              onOpenSettings={() => setIsSettingsOpen(true)}
            />
          }
        >
          {messages.length === 0 ? (
            <WelcomeScreen onSelectPrompt={(prompt) => handleSendMessage(prompt, [])} />
          ) : (
            <div
              style={{
                maxWidth: "850px",
                margin: "0 auto",
                padding: "24px 20px 80px 20px",
                width: "100%",
              }}
            >
              <ChatMessageList>
                {messages.map((msg) => (
                  <MessageItem
                    key={msg.id}
                    message={msg}
                    isStreaming={isGenerating && msg.id === activeAssistantMsgId}
                    onRegenerate={handleRegenerate}
                  />
                ))}
              </ChatMessageList>
            </div>
          )}
        </ChatLayout>
      </div>

      {/* Workbench Settings Modal Dialog */}
      <SettingsDialog
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        themeMode={themeMode}
        onToggleTheme={handleToggleTheme}
        selectedModel={selectedModel}
        onSelectModel={handleSelectModel}
        providersData={providersData}
        onClearHistory={handleClearAllHistory}
        conversationCount={conversations.length}
        messageCount={allMessageCount}
        isDaemonOnline={isOnline}
        onProvidersUpdated={refreshProviders}
      />
    </AppShell>
  );
};
