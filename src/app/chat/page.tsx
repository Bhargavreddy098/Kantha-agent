"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { DashboardShell, DashboardButton, DashboardConfirmDialog } from "@/components/block/dashboard-shell";
import { navigation, secondaryNavigation } from "@/components/block/dashboard-shell-config";
import { PromptInput } from "@/components/ui/prompt-input";
import { SettingsDialog, type SettingsSection } from "@/components/block/settings-dialog";
import { RunStatusIndicator } from "@/components/gateway/run-status-indicator";
import { ApprovalPanel } from "@/components/gateway/approval-panel";
import { useGatewayEvents } from "@/components/gateway/use-gateway-events";
import { useAIProvider } from "@/hooks/use-ai-provider";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Download,
  Trash2,
  Settings as SettingsIcon,
  Sparkles,
  ShieldAlert,
} from "lucide-react";

// Core AI Elements: Conversation, Message & MessageResponse, Reasoning
import {
  Conversation,
  ConversationContent,
  Message,
  MessageResponse,
  Reasoning,
} from "@/components/ui/ai-elements";
import type { AgentMessage, AgentPart } from "@/types/agent-chat";
import { mapUIMessageToAgentMessage } from "@/lib/agent-adapter";
import { GatewayAccessGate, useGatewayAccess } from "@/components/gateway/gateway-access-gate";
import { GATEWAY_ACCESS_CHANGED, gatewayMessage, gatewayRequest, GatewayRequestError, jsonBody, readGatewayError } from "@/components/gateway/gateway-client";
import type { GatewaySession } from "@/lib/gateway/contracts/session";
import type { GatewayApproval } from "@/lib/gateway/contracts/approval";
import type { RunSnapshot } from "@/lib/gateway/contracts/run";

const STARTERS = [
  {
    title: "System Architecture",
    description: "Design resilient LLM multi-provider fallback strategies",
    prompt:
      "Explain the key architectural considerations and trade-offs when designing a resilient AI gateway with multi-provider failover for production.",
  },
  {
    title: "TypeScript Engineering",
    description: "Write an async debounce with abort cancellation",
    prompt:
      "Write an idiomatic TypeScript debounce utility function that supports immediate invocation and AbortSignal cancellation with full types.",
  },
  {
    title: "Streaming Protocols",
    description: "Compare SSE vs WebSockets in modern AI interfaces",
    prompt:
      "Compare Server-Sent Events (SSE) and WebSockets for real-time LLM token streaming in terms of caching, connection lifecycle, and proxy compatibility.",
  },
];


export default function ChatPage() {
  return <GatewayAccessGate><ChatWorkspace /></GatewayAccessGate>;
}

function ChatWorkspace() {
  const router = useRouter();
  const access = useGatewayAccess();
  const sessionKey = "kantha:session:" + access?.workspaceId + ":" + access?.actorId;
  const { selected, selectedKey, modelOptions, setSelectedModel, loading: loadingModels, error: modelError } = useAIProvider();

  const [sessionId, setSessionId] = useState<string>();
  const [initialized, setInitialized] = useState(false);
  const [inputMessage, setInputMessage] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("model-providers");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string>();
  const [lastDraftOnFailure, setLastDraftOnFailure] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [clearOpen, setClearOpen] = useState(false);
  const [tryingApproval, setTryingApproval] = useState(false);
  const sdkInFlight = useRef(false);
  const sendFailed = useRef(false);
  const cancelInFlight = useRef(false);

  useEffect(() => {
    let mounted = true;
    Promise.resolve().then(() => {
      if (!mounted) return;
      try {
        setSessionId(sessionStorage.getItem(sessionKey) || undefined);
      } catch {
        // Chat can operate without browser storage.
      }
      setInitialized(true);
    });
    return () => { mounted = false; };
  }, [sessionKey]);

  const transport = useMemo(() => new DefaultChatTransport<UIMessage>({
    api: "/api/chat",
    fetch: async (url, options) => {
      const response = await fetch(url, options);
      if (!response.ok) {
        if (response.status === 401) window.dispatchEvent(new Event(GATEWAY_ACCESS_CHANGED));
        throw await readGatewayError(response);
      }
      const id = response.headers.get("x-kantha-run-id") ?? undefined;
      setActiveRunId(id);
      return response;
    },
  }), []);

  const { messages, sendMessage, stop, status, error: chatError, setMessages, clearError } = useChat({
    transport,
    onError: () => { sendFailed.current = true; },
    onFinish: ({ isError, isDisconnect }) => { sendFailed.current ||= isError || isDisconnect; },
  });

  const restoreSnapshot = useCallback((snapshot: RunSnapshot) => {
    if (sdkInFlight.current) return;
    const restored: UIMessage[] = [];
    for (const message of snapshot.messages) {
      if (message.role !== "user" && message.role !== "assistant" && message.role !== "system") continue;
      const parts: UIMessage["parts"] = [];
      for (const part of message.parts ?? []) {
        if ((part.type === "text" || part.type === "reasoning") && typeof part.text === "string") {
          parts.push({ type: part.type, text: part.text });
        }
      }
      restored.push({
        id: message.id,
        role: message.role,
        parts: parts.length > 0 ? parts : [{ type: "text", text: message.content }],
      });
    }
    setMessages(restored);
  }, [setMessages]);

  const { run, approval, reconnecting, loading: sessionLoading, error: sessionError, resolveApproval, rememberApproval, refresh, cancel } =
    useGatewayEvents(sessionId, restoreSnapshot);
  const runStatus = reconnecting ? "reconnecting" : run?.status ?? (isSubmitting ? "queued" : undefined);
  const isStreaming = status === "streaming";
  const isBusy = isSubmitting || isStopping || status === "submitted" || isStreaming ||
    run?.status === "queued" || run?.status === "running" || run?.status === "waiting_for_approval";
  const activeModel = selected?.name ?? "Assistant";

  const agentMessages: AgentMessage[] = useMemo(() => messages.map((message) =>
    mapUIMessageToAgentMessage(message, isStreaming)
  ), [messages, isStreaming]);
  const lastMessage = agentMessages.at(-1);

  function rememberSession(id: string | undefined) {
    setSessionId(id);
    try {
      if (id) sessionStorage.setItem(sessionKey, id);
      else sessionStorage.removeItem(sessionKey);
    } catch {
      // Chat can operate without browser storage.
    }
  }

  async function ensureSession(title: string) {
    if (sessionId) return sessionId;
    const session = await gatewayRequest<GatewaySession>("/api/gateway/sessions", {
      method: "POST",
      ...jsonBody({ title }),
    });
    rememberSession(session.id);
    return session.id;
  }

  async function transmit(text: string) {
    if (!text || isBusy || sessionLoading || tryingApproval || sdkInFlight.current || !initialized) return;
    if (!selected) {
      openSettings();
      return;
    }
    sdkInFlight.current = true;
    sendFailed.current = false;
    setActiveRunId(undefined);
    setActionError(undefined);
    setLastDraftOnFailure(undefined);
    clearError();
    setIsSubmitting(true);
    try {
      const id = await ensureSession(text.slice(0, 80));
      setInputMessage("");
      setAttachments([]);
      await sendMessage({ role: "user", parts: [{ type: "text", text }] }, {
        body: { sessionId: id, submissionKey: crypto.randomUUID(), model: selected.id, connectionId: selected.connectionId },
      });
      if (sendFailed.current) setLastDraftOnFailure(text);
    } catch (error) {
      setLastDraftOnFailure(text);
      setActionError(gatewayMessage(error, "Could not send this message. Try again."));
    } finally {
      sdkInFlight.current = false;
      setIsSubmitting(false);
      if (!cancelInFlight.current) setIsStopping(false);
      void refresh().catch(() => undefined);
    }
  }

  async function tryApproval() {
    if (isBusy || sessionLoading || tryingApproval) return;
    setTryingApproval(true);
    setActionError(undefined);
    try {
      const id = await ensureSession("Approval check");
      const next = await gatewayRequest<GatewayApproval>("/api/gateway/approvals", {
        method: "POST",
        ...jsonBody({ sessionId: id }),
      });
      rememberApproval(next);
      if (sessionId) void refresh().catch(() => undefined);
    } catch (error) {
      setActionError(gatewayMessage(error, "Could not start the approval check."));
    } finally {
      setTryingApproval(false);
    }
  }

  const handleStop = () => { setIsStopping(true); };
  useEffect(() => {
    const observedRunId = run?.status === "running" || run?.status === "queued" || run?.status === "waiting_for_approval" ? run.id : undefined;
    const id = isSubmitting ? activeRunId : observedRunId;
    if (!isStopping || !id || cancelInFlight.current) return;
    cancelInFlight.current = true;
    cancel(id).then(() => {
      stop();
      void refresh().catch(() => undefined);
    }).catch((error) => {
      setActionError(gatewayMessage(error, "The gateway did not acknowledge Stop. Refresh the conversation and try again."));
    }).finally(() => {
      cancelInFlight.current = false;
      setIsStopping(false);
    });
  }, [activeRunId, cancel, isStopping, isSubmitting, refresh, run, stop]);

  async function handleClearChat() {
    if (isBusy || sdkInFlight.current) return;
    setActionError(undefined);
    try {
      if (sessionId) await gatewayRequest("/api/gateway/sessions/" + encodeURIComponent(sessionId), { method: "DELETE" });
      resetConversation();
    } catch (error) {
      setActionError(gatewayMessage(error, "Could not clear this conversation."));
    }
  }

  function resetConversation() {
    rememberSession(undefined);
    setActionError(undefined);
    setMessages([]);
    clearError();
    setLastDraftOnFailure(undefined);
    setActiveRunId(undefined);
  }

  const handleExportChat = useCallback(() => {
    const transcript = agentMessages.map((message) => {
      const role = message.role === "user" ? "User" : "Assistant";
      const text = message.parts.filter((part) => part.type === "text").map((part) => part.text).join("\n");
      return "### " + role + "\n\n" + text + "\n\n---\n";
    }).join("\n");
    const url = URL.createObjectURL(new Blob([transcript], { type: "text/markdown;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "chat-export-" + new Date().toISOString().slice(0, 10) + ".md";
    link.click();
    URL.revokeObjectURL(url);
  }, [agentMessages]);

  function handleRestoreDraft() {
    if (lastDraftOnFailure) {
      setInputMessage(lastDraftOnFailure);
      setLastDraftOnFailure(undefined);
    }
  }

  function openSettings(section: SettingsSection = "model-providers") {
    setSettingsSection(section);
    setSettingsOpen(true);
  }

  return (
    <DashboardShell
      brand={{ name: "ObsidianUI", description: "AI Chat Control Plane" }}
      navigation={navigation}
      secondaryNavigation={secondaryNavigation}
      activeItemId="chat"
      onActiveItemChange={(id) => {
        if (id === "settings") {
          router.push("/settings");
        }
      }}
      title="Chat"
      sidebarWidth={240}
      defaultSidebarWidth={240}
      linkComponent={Link}
    >
      <div className="flex flex-col h-[calc(100vh-60px)] w-full overflow-hidden bg-white text-neutral-900">
        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-6 py-2.5 border-b border-neutral-200/80 bg-white/80 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-semibold text-neutral-900 tracking-tight flex items-center gap-2">
              <span>Chat</span>
              {runStatus && runStatus !== "reconnecting" && runStatus !== "interrupted" && <RunStatusIndicator status={runStatus} compact runId={run?.id} />}
            </h1>

            {selected && (
              <span className="text-xs text-neutral-500 font-mono hidden sm:inline">
                • {activeModel}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {access?.roles?.includes("owner") && (
              <DashboardButton
                size="sm"
                variant="secondary"
                onClick={() => void tryApproval()}
                disabled={!initialized || sessionLoading || isBusy || tryingApproval}
                title="Exercise an inert workspace approval"
              >
                <ShieldAlert className="mr-1 size-3.5" />
                {tryingApproval ? "Starting…" : "Try approval"}
              </DashboardButton>
            )}

            {messages.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleExportChat}
                  title="Export chat transcript"
                  aria-label="Export chat transcript"
                  className="size-8 rounded-lg flex items-center justify-center text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors cursor-pointer"
                >
                  <Download className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setClearOpen(true)}
                  disabled={isBusy}
                  title="Clear conversation"
                  aria-label="Clear conversation"
                  className="size-8 rounded-lg flex items-center justify-center text-neutral-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => openSettings()}
              aria-label="Open settings"
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 transition-colors cursor-pointer"
            >
              <SettingsIcon className="size-3.5" />
              <span className="hidden sm:inline">Settings</span>
            </button>
          </div>
        </div>

        {/* Focused Chat Stream Container */}
        <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
          <Conversation isStreaming={status === "streaming"}>
            {agentMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center min-h-[380px] text-center px-4">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-neutral-100 border border-neutral-200/90 text-neutral-800 mb-3 shadow-xs">
                  <Sparkles className="size-6 text-neutral-800" />
                </div>

                <h2 className="text-base font-semibold text-neutral-900 tracking-tight sm:text-lg">
                  What can I help you with today?
                </h2>
                <p className="text-xs text-neutral-500 max-w-md mt-1 mb-6 leading-relaxed">
                  {loadingModels
                    ? "Loading workspace models…"
                    : selected
                      ? "Using " + selected.name + ". Select a starter or type a prompt below."
                      : "Add a provider and discover its models in Settings to start chatting."}
                </p>

                {/* Starter Prompts */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full text-left">
                  {STARTERS.map((item, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => void transmit(item.prompt)}
                      disabled={!selected || sessionLoading || isBusy || !initialized}
                      className="flex flex-col justify-between p-3.5 rounded-xl border border-neutral-200/90 bg-white hover:border-neutral-400 hover:shadow-xs transition-all cursor-pointer text-left"
                    >
                      <div>
                        <span className="text-xs font-semibold text-neutral-800">
                          {item.title}
                        </span>
                        <p className="text-[11px] text-neutral-500 mt-1 line-clamp-2 leading-relaxed">
                          {item.description}
                        </p>
                      </div>
                      <div className="mt-3 text-[10px] text-neutral-400 font-medium hover:text-neutral-700">
                        Ask prompt →
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <ConversationContent>
                {agentMessages.map((message) => {
                  const isUser = message.role === "user";

                  return (
                    <Message
                      key={message.id}
                      role={message.role}
                      avatarName={isUser ? "You" : activeModel}
                      timestamp={message.createdAt?.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    >
                      {/* Render parts strictly in sequence */}
                      <div className="space-y-3 w-full">
                        {message.parts.map((part: AgentPart, idx: number) => {
                          switch (part.type) {
                            case "text":
                              return (
                                <MessageResponse key={idx}>
                                  {part.text}
                                </MessageResponse>
                              );

                            case "reasoning":
                              return (
                                <Reasoning
                                  key={idx}
                                  content={part.text}
                                  isStreaming={Boolean(part.isStreaming)}
                                />
                              );

                            default:
                              return null;
                          }
                        })}
                      </div>
                    </Message>
                  );
                })}

                {status === "streaming" && lastMessage?.role === "assistant" && (
                  <div className="flex items-center gap-2 pl-10 py-1 text-xs text-neutral-400 font-mono animate-pulse">
                    <span className="size-1.5 rounded-full bg-blue-600" />
                    <span>Streaming tokens from {activeModel}...</span>
                  </div>
                )}
              </ConversationContent>
            )}
          </Conversation>

          {approval && (
            <div className="mb-2 max-h-[30vh] w-full max-w-2xl shrink-0 overflow-auto px-4 mx-auto">
              <ApprovalPanel key={approval.id} approval={approval} onResolve={resolveApproval} />
            </div>
          )}

          {/* PromptInput with integrated Model Selector & Recovery */}
          <div className="shrink-0 max-w-3xl mx-auto w-full px-4 pb-4 pt-1">
            {(chatError || actionError || modelError || sessionError || lastDraftOnFailure) && (
              <div role="alert" className="mb-2 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                <span>{actionError || chatError?.message || sessionError || modelError || "The connection was interrupted. Check the conversation before sending again."}</span>
                <div className="flex flex-wrap gap-2">
                  {lastDraftOnFailure && <DashboardButton size="sm" variant="secondary" onClick={handleRestoreDraft}>Restore draft</DashboardButton>}
                  {chatError instanceof GatewayRequestError && chatError.code === "budget_exceeded" && (
                    <DashboardButton size="sm" variant="secondary" onClick={() => openSettings("usage")}>View usage and limits</DashboardButton>
                  )}
                  {sessionError && <DashboardButton size="sm" variant="secondary" onClick={resetConversation} disabled={isBusy}>Start a new conversation</DashboardButton>}
                  {sessionId && <DashboardButton size="sm" variant="secondary" onClick={() => void refresh().catch(() => undefined)}>Refresh conversation</DashboardButton>}
                </div>
              </div>
            )}

            {(runStatus === "interrupted" || runStatus === "reconnecting") && (
              <div className="mb-2"><RunStatusIndicator status={runStatus} /></div>
            )}

            <PromptInput
              value={inputMessage}
              onChange={setInputMessage}
              onSubmit={() => void transmit(inputMessage.trim())}
              isBusy={isBusy}
              stopPending={isStopping}
              onStop={handleStop}
              attachments={attachments}
              onRemoveAttachment={(name) =>
                setAttachments((prev) => prev.filter((a) => a !== name))
              }
              models={modelOptions.map((option) => option.value)}
              modelOptionLabels={Object.fromEntries(modelOptions.map((option) => [option.value, option.label]))}
              selectedModel={selectedKey}
              disabled={!initialized || sessionLoading || !selected || Boolean(sessionError && !run)}
              onSelectModel={setSelectedModel}
              onOpenSettings={() => openSettings()}
              placeholder={
                isStopping
                  ? "Stopping stream..."
                  : selected ? "Message " + selected.name + "…" : "Configure a provider to chat"
              }
            />
          </div>
        </div>
      </div>

      <DashboardConfirmDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        title="Clear this conversation?"
        description="The stored messages in this conversation will be removed."
        confirmLabel="Clear conversation"
        tone="danger"
        onConfirm={() => void handleClearChat()}
      />

      {/* Settings Dialog */}
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        initialSection={settingsSection}
      />
    </DashboardShell>
  );
}
