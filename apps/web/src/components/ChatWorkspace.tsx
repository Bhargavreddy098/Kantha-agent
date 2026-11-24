import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  AppShell,
  Banner,
  ChatLayout,
  ChatMessageList,
  HStack,
  IconButton,
  SegmentedControl,
  SegmentedControlItem,
  Text,
  TopNav,
} from "@astryxdesign/core";
import { Activity, MessageSquare, Settings, Terminal } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { Sidebar } from "./Sidebar";
import { WelcomeScreen } from "./WelcomeScreen";
import { MessageItem } from "./MessageItem";
import { Composer } from "./Composer";
import { SettingsDialog } from "./SettingsDialog";
import { HarnessWorkspace } from "./HarnessWorkspace";
import { GatewayInspector } from "./GatewayInspector";
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

type WorkspaceMode = "chat" | "harness" | "inspector";

export const ChatWorkspace: React.FC = () => {
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("chat");
  const [pendingHarnessPrompt, setPendingHarnessPrompt] = useState<string | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [themeMode, setThemeMode] = useState<"light" | "dark">("light");
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeAssistantMsgId, setActiveAssistantMsgId] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [providersData, setProvidersData] = useState<ProvidersDataResponse | null>(null);
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    return localStorage.getItem("kantha_selected_model") || "openrouter:openrouter/free";
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const conversations = useConversations();
  const messages = useMessages(activeConversationId);
  const allMessageCount = useLiveQuery(() => chatDb.messages.count()) || 0;

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
        const isSavedConfigured = (() => {
          if (!saved) return false;
          const providerPrefix = saved.includes(":") ? saved.slice(0, saved.indexOf(":")) : "";
          const prov = data.providers?.find((p) => p.id === providerPrefix);
          return Boolean(prov && prov.configured);
        })();

        const activeModel = isSavedConfigured
          ? saved!
          : data.defaultModel || "openrouter:openrouter/free";
        setSelectedModel(activeModel);
        localStorage.setItem("kantha_selected_model", activeModel);
      })
      .catch(() => {
        setIsOnline(false);
      });
  }, []);

  useEffect(() => {
    fetch("/api/auth/handshake", { credentials: "include" })
      .then(() => refreshProviders())
      .catch(() => refreshProviders());
  }, [refreshProviders]);

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

  const handleSelectModel = (modelId: string) => {
    setSelectedModel(modelId);
    localStorage.setItem("kantha_selected_model", modelId);
    if (activeConversationId) {
      chatDb.conversations.update(activeConversationId, { model: modelId, updatedAt: Date.now() });
    }
  };

  useEffect(() => {
    if (activeConversationId) {
      const active = conversations.find((c) => c.id === activeConversationId);
      if (active?.model) {
        setSelectedModel(active.model);
      }
    }
  }, [activeConversationId, conversations]);

  const handleClearAllHistory = async () => {
    await chatDb.messages.clear();
    await chatDb.conversations.clear();
    setActiveConversationId(null);
  };

  const handleNewChat = async () => {
    if (isGenerating && abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setWorkspaceMode("chat");
    const newId = await createConversation();
    setActiveConversationId(newId);
  };

  const handleSendMessage = async (text: string, attachments: StoredAttachment[]) => {
    setFallbackNotice(null);
    let convId = activeConversationId;

    if (!convId) {
      const generatedTitle = generateConversationTitle(text || attachments[0]?.name || "New Thread");
      convId = await createConversation(generatedTitle);
      setActiveConversationId(convId);
    } else if (messages.length === 0) {
      const generatedTitle = generateConversationTitle(text || attachments[0]?.name || "New Thread");
      await renameConversation(convId, generatedTitle);
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
      onFallback: (info) => {
        setFallbackNotice(
          `Gateway switched from ${info.fromModelId} → ${info.toModelId} (${info.reason})`
        );
      },
      onToken: async (delta) => {
        accumulatedContent += delta;
        await updateMessage(assistantMsgId, { content: accumulatedContent });
      },
      onReasoning: async (delta) => {
        accumulatedReasoning += delta;
        await updateMessage(assistantMsgId, { reasoning: accumulatedReasoning });
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
    const lastUserIndex = messages.map((m) => m.role).lastIndexOf("user");
    if (lastUserIndex === -1) return;
    const lastUserMsg = messages[lastUserIndex];
    handleSendMessage(lastUserMsg.content, lastUserMsg.attachments || []);
  };

  const activeConversation = conversations.find((c) => c.id === activeConversationId);

  const navHeadingTitle =
    workspaceMode === "harness"
      ? "Harness Orchestrator"
      : workspaceMode === "inspector"
      ? "Gateway & Tool Inspector"
      : activeConversation
      ? activeConversation.title
      : "Kantha Workbench";

  return (
    <AppShell
      variant="section"
      height="fill"
      sideNav={
        <Sidebar
          activeConversationId={activeConversationId}
          onSelectConversation={(id) => {
            setActiveConversationId(id);
            setWorkspaceMode("chat");
          }}
          onNewChat={handleNewChat}
          themeMode={themeMode}
          onToggleTheme={handleToggleTheme}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />
      }
      topNav={
        <TopNav
          label="Kantha Workbench navigation"
          style={{
            height: "52px",
            backgroundColor: "var(--swiss-surface)",
            borderBottom: "1px solid var(--swiss-border)",
            padding: "0 20px",
          }}
          heading={
            <Text
              size="sm"
              weight="semibold"
              maxLines={1}
              style={{
                color: "var(--swiss-text)",
                letterSpacing: "-0.01em",
              }}
            >
              {navHeadingTitle}
            </Text>
          }
          centerContent={
            <SegmentedControl
              label="Workbench mode"
              size="sm"
              value={workspaceMode}
              onChange={(val) => setWorkspaceMode(val as WorkspaceMode)}
            >
              <SegmentedControlItem
                value="chat"
                label="Chat"
                icon={<MessageSquare size={13} />}
              />
              <SegmentedControlItem
                value="harness"
                label="Harness"
                icon={<Terminal size={13} />}
              />
              <SegmentedControlItem
                value="inspector"
                label="Inspector"
                icon={<Activity size={13} />}
              />
            </SegmentedControl>
          }
          endContent={
            <HStack align="center" gap="10px">
              <Text
                size="xs"
                style={{
                  fontFamily: "var(--font-mono)",
                  color: "var(--swiss-text-secondary)",
                }}
              >
                {selectedModel.includes(":")
                  ? selectedModel.slice(selectedModel.indexOf(":") + 1)
                  : selectedModel}
              </Text>
              <IconButton
                icon={<Settings size={15} />}
                label="Workbench Settings"
                variant="ghost"
                size="sm"
                onClick={() => setIsSettingsOpen(true)}
              />
            </HStack>
          }
        />
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
          overflow: "hidden",
        }}
      >
        {workspaceMode === "harness" ? (
          <HarnessWorkspace
            selectedModel={selectedModel}
            onSelectModel={handleSelectModel}
            providersData={providersData}
            onOpenSettings={() => setIsSettingsOpen(true)}
            initialPrompt={pendingHarnessPrompt}
            onClearInitialPrompt={() => setPendingHarnessPrompt(null)}
          />
        ) : workspaceMode === "inspector" ? (
          <GatewayInspector />
        ) : (
          <ChatLayout
            density="balanced"
            composer={
              <div style={{ width: "100%", maxWidth: "880px", margin: "0 auto" }}>
                {fallbackNotice && (
                  <div style={{ marginBottom: "8px" }}>
                    <Banner
                      status="info"
                      title="Gateway Failover"
                      description={fallbackNotice}
                      isDismissable
                      onDismiss={() => setFallbackNotice(null)}
                    />
                  </div>
                )}
                <Composer
                  onSubmit={handleSendMessage}
                  onStop={handleStopGeneration}
                  isGenerating={isGenerating}
                  selectedModel={selectedModel}
                  onSelectModel={handleSelectModel}
                  providersData={providersData}
                  onOpenSettings={() => setIsSettingsOpen(true)}
                />
              </div>
            }
          >
            {messages.length === 0 ? (
              <WelcomeScreen
                onSelectPrompt={(prompt) => handleSendMessage(prompt, [])}
                onLaunchHarness={(prompt) => {
                  if (prompt) setPendingHarnessPrompt(prompt);
                  setWorkspaceMode("harness");
                }}
              />
            ) : (
              <div
                style={{
                  maxWidth: "880px",
                  margin: "0 auto",
                  padding: "20px 24px 72px 24px",
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
        )}
      </div>

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
