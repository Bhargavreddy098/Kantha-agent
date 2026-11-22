import React, { useState, useEffect, useRef } from "react";
import { AppShell, ChatLayout, ChatMessageList } from "@astryxdesign/core";
import { Sidebar } from "./Sidebar";
import { WelcomeScreen } from "./WelcomeScreen";
import { MessageItem } from "./MessageItem";
import { Composer } from "./Composer";
import {
  useConversations,
  useMessages,
  createConversation,
  saveMessage,
  updateMessage,
  generateConversationTitle,
} from "../db/useChatHistory";
import { streamChatResponse } from "../services/chatStreamService";
import type { StoredMessage, StoredAttachment } from "../db/chatDb";

export const ChatWorkspace: React.FC = () => {
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [themeMode, setThemeMode] = useState<"light" | "dark">("light");
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeAssistantMsgId, setActiveAssistantMsgId] = useState<string | null>(null);
  const [modelStatus, setModelStatus] = useState<string>("Connecting...");
  const [isOnline, setIsOnline] = useState<boolean>(true);

  const abortControllerRef = useRef<AbortController | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const conversations = useConversations();
  const messages = useMessages(activeConversationId);

  // Apply theme data attribute to document body
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", themeMode);
  }, [themeMode]);

  // Discover daemon providers / status
  useEffect(() => {
    fetch("/api/providers")
      .then((res) => {
        if (!res.ok) throw new Error("Offline");
        return res.json();
      })
      .then((data) => {
        setIsOnline(true);
        const model = data.defaultModel || "GPT-4o";
        setModelStatus(`Connected: ${model}`);
      })
      .catch(() => {
        // Fallback for standalone / disconnected mode
        setIsOnline(true);
        setModelStatus("Ready: Local Model Engine");
      });
  }, []);

  // Default to most recent conversation if available and none selected
  useEffect(() => {
    if (!activeConversationId && conversations.length > 0) {
      setActiveConversationId(conversations[0].id);
    }
  }, [conversations, activeConversationId]);

  const handleToggleTheme = () => {
    setThemeMode((prev) => (prev === "light" ? "dark" : "light"));
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
        const { renameConversation } = await import("../db/useChatHistory");
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

    await streamChatResponse({
      messages: fullHistory,
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

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
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
    </AppShell>
  );
};
