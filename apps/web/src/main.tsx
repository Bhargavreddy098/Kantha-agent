import "./index.css";
import React, { useState, useEffect, useRef, useCallback } from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Theme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";
import { AppShell } from "@astryxdesign/core/AppShell";
import { SideNav, SideNavItem, SideNavSection } from "@astryxdesign/core/SideNav";
import { TopNav, TopNavHeading } from "@astryxdesign/core/TopNav";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import { Heading } from "@astryxdesign/core/Heading";
import { TextInput } from "@astryxdesign/core/TextInput";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { TerminalView } from "./terminal/TerminalView";
import type { KanthaEvent } from "@kantha/protocol";

const queryClient = new QueryClient();

interface WorkspaceInfo {
  name: string;
  path: string;
  gitBranch: string;
  isGitRepo: boolean;
  modifiedFilesCount?: number;
  timestamp: number;
}

interface SessionItem {
  id: string;
  title: string;
  updatedAt: number;
}

type ConnectionState = "connecting" | "connected" | "session_expired" | "offline";

function KanthaAstryxWorkbench() {
  const [sessionId, setSessionId] = useState<string>(`session_${Date.now()}`);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [prompt, setPrompt] = useState("");
  const [events, setEvents] = useState<KanthaEvent[]>([]);
  const [activeTab, setActiveTab] = useState<"stream" | "terminal">("stream");
  const [agentStatus, setAgentStatus] = useState<string>("idle");
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [retryCountdown, setRetryCountdown] = useState<number>(3);

  const eventSourceRef = useRef<EventSource | null>(null);
  const streamEndRef = useRef<HTMLDivElement>(null);

  // Authenticate via pairing ticket or verify existing session cookie
  const checkConnectionAndDiscover = useCallback(async () => {
    try {
      setConnectionState("connecting");

      // 1. Check for Pairing Ticket in URL fragment (#ticket=...)
      const hash = window.location.hash;
      const match = hash.match(/ticket=([a-f0-9]+)/i);
      if (match && match[1]) {
        const ticket = match[1];

        // Immediately purge ticket from URL to prevent shoulder-surfing and history leakage per ADR-007
        window.history.replaceState({}, "", "/");

        // Exchange pairing ticket for HttpOnly, SameSite=Strict session cookie
        const pairRes = await fetch("/api/auth/pair", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticket }),
        });

        if (pairRes.ok) {
          const pairData = await pairRes.json();
          setConnectionState("connected");
          if (pairData.workspace) setWorkspace(pairData.workspace);
          loadWorkspaceData();
          return;
        }
      }

      // 2. No ticket in fragment: check if existing session cookie is valid
      const sessionRes = await fetch("/api/auth/session");
      if (sessionRes.ok) {
        const sessionData = await sessionRes.json();
        if (sessionData.authenticated) {
          setConnectionState("connected");
          if (sessionData.workspace) setWorkspace(sessionData.workspace);
          loadWorkspaceData();
          return;
        }
      }

      if (sessionRes.status === 401) {
        // Daemon is online, but session is missing, expired, or daemon restarted
        setConnectionState("session_expired");
        return;
      }

      throw new Error("Daemon unreachable");
    } catch {
      setConnectionState("offline");
    }
  }, []);

  const loadWorkspaceData = () => {
    // Auto-discover workspace
    fetch("/api/workspace")
      .then((r) => {
        if (r.status === 401) {
          setConnectionState("session_expired");
          throw new Error("Unauthorized");
        }
        return r.json();
      })
      .then((data: WorkspaceInfo) => setWorkspace(data))
      .catch(() => {});

    // Fetch recent sessions
    fetch("/api/sessions")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { sessions: SessionItem[] } | null) => {
        if (data && data.sessions && data.sessions.length > 0) {
          setSessions(data.sessions);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    checkConnectionAndDiscover();

    // Listen for incoming pairing tickets (e.g. if developer runs `kantha open` while workbench is open)
    const handleHashChange = () => {
      if (window.location.hash.includes("ticket=")) {
        checkConnectionAndDiscover();
      }
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [checkConnectionAndDiscover]);

  // Auto-retry when daemon is offline
  useEffect(() => {
    if (connectionState !== "offline") return;

    const timer = setInterval(() => {
      setRetryCountdown((prev) => {
        if (prev <= 1) {
          checkConnectionAndDiscover();
          return 3;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [connectionState, checkConnectionAndDiscover]);

  // SSE event streaming for current session
  useEffect(() => {
    if (connectionState !== "connected") return;

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = new EventSource(`/api/sessions/${sessionId}/events`);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as KanthaEvent;
        setEvents((prev) => [...prev, data]);
        if (data.type === "status_change") {
          setAgentStatus(data.status);
        }
      } catch {
        // SSE heartbeat
      }
    };

    eventSource.onerror = () => {
      // If unauthorized, session may have expired
      fetch("/api/auth/session").then((r) => {
        if (r.status === 401) {
          setConnectionState("session_expired");
        }
      });
    };

    return () => {
      eventSource.close();
    };
  }, [sessionId, connectionState]);

  // Scroll to bottom on new event
  useEffect(() => {
    streamEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

  const sendPrompt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || agentStatus === "executing") return;

    const currentPrompt = prompt;
    setEvents((prev) => [
      ...prev,
      {
        type: "status_change",
        status: "running",
        sessionId,
        timestamp: Date.now(),
      },
      {
        type: "token_delta",
        text: `> User Prompt: ${currentPrompt}\n\n`,
        sessionId,
        timestamp: Date.now(),
      },
    ]);
    setPrompt("");
    setAgentStatus("executing");

    try {
      const res = await fetch(`/api/sessions/${sessionId}/prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: currentPrompt }),
      });

      if (res.status === 401) {
        setConnectionState("session_expired");
        setPrompt(currentPrompt); // Restore unsent draft
        return;
      }

      if (!res.ok) {
        throw new Error("Failed to dispatch prompt");
      }
    } catch {
      setAgentStatus("error");
      setPrompt(currentPrompt); // Restore unsent draft
    }
  };

  const startNewSession = async () => {
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: `Workspace Task ${sessions.length + 1}` }),
      });
      if (res.ok) {
        const newSession = await res.json();
        setSessionId(newSession.id);
        setEvents([]);
        loadWorkspaceData();
      }
    } catch {
      // ignore
    }
  };

  return (
    <Theme theme={neutralTheme}>
      <AppShell
        topNav={
          <TopNav
            heading={
              <TopNavHeading
                heading="Kantha Agent Workbench"
                subheading={
                  workspace
                    ? `${workspace.name} [${workspace.gitBranch}]`
                    : "Connecting to Daemon..."
                }
              />
            }
            endContent={
              <HStack gap={2} align="center">
                {connectionState === "connected" && (
                  <Badge variant="neutral" label="Authenticated (ADR-007)" />
                )}
                {connectionState === "session_expired" && (
                  <Badge variant="neutral" label="Session Expired" />
                )}
                {connectionState === "offline" && (
                  <Badge variant="neutral" label="Daemon Offline" />
                )}

                <Button
                  size="sm"
                  variant={activeTab === "stream" ? "primary" : "secondary"}
                  onClick={() => setActiveTab("stream")}
                  label="Agent Stream"
                />
                <Button
                  size="sm"
                  variant={activeTab === "terminal" ? "primary" : "secondary"}
                  onClick={() => setActiveTab("terminal")}
                  label="Terminal"
                />
              </HStack>
            }
          />
        }
        sideNav={
          <SideNav aria-label="Workspace navigation" collapsible>
            <SideNavSection title="Workspace">
              <SideNavItem
                label="Chat"
                icon="viewColumns"
                isSelected={activeTab === "stream"}
                onClick={() => setActiveTab("stream")}
              />
              <SideNavItem
                label="Terminal"
                icon="terminal"
                isSelected={activeTab === "terminal"}
                onClick={() => setActiveTab("terminal")}
              />
            </SideNavSection>

            <SideNavSection title="Sessions">
              <div style={{ padding: "8px 12px" }}>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={startNewSession}
                  label="+ New Session"
                />
              </div>
              <SideNavItem
                label="Active Session"
                icon="chat"
                isSelected={true}
                onClick={() => {}}
              />
              {sessions.map((s) => (
                <SideNavItem
                  key={s.id}
                  label={s.title}
                  icon="clock"
                  isSelected={false}
                  onClick={() => {
                    setSessionId(s.id);
                    setEvents([]);
                  }}
                />
              ))}
            </SideNavSection>
          </SideNav>
        }
      >
        <div style={{ padding: "24px", height: "100%", boxSizing: "border-box" }}>
          {/* Non-destructive Reconnect Overlay for Session Expiration */}
          {connectionState === "session_expired" && (
            <div style={{ marginBottom: "16px" }}>
              <Banner
                status="warning"
                title="Daemon Session Expired or Restarted"
                description="The local daemon was restarted or the session expired. Run `kantha open` in your terminal to re-authenticate, or launch with a new pairing ticket. Your prompt draft is preserved."
              >
                <div style={{ marginTop: "12px" }}>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={checkConnectionAndDiscover}
                    label="Check Reconnection"
                  />
                </div>
              </Banner>
            </div>
          )}

          {connectionState === "offline" ? (
            <div style={{ maxWidth: "600px", margin: "40px auto" }}>
              <Card>
                <VStack gap={2}>
                  <Heading level={2}>Connecting to Kantha Local Daemon</Heading>
                  <Text>
                    Kantha protects local workspaces using Automatic Local Session Authentication (ADR-007).
                    Your browser is negotiating an automated connection to{" "}
                    <strong>http://127.0.0.1:4000</strong>.
                  </Text>
                  <Banner
                    status="warning"
                    title="Daemon Offline"
                    description={`Retrying connection in ${retryCountdown}s... Start the daemon in terminal with: pnpm dev:daemon`}
                  >
                    <div style={{ marginTop: "12px" }}>
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={checkConnectionAndDiscover}
                        label="Retry Now"
                      />
                    </div>
                  </Banner>
                </VStack>
              </Card>
            </div>
          ) : (
            <div style={{ height: "calc(100vh - 120px)", display: "flex", flexDirection: "column" }}>
              {activeTab === "stream" ? (
                <VStack gap={2} style={{ flex: 1, minHeight: 0 }}>
                  <div
                    style={{
                      flex: 1,
                      overflowY: "auto",
                      padding: "16px",
                      background: "#ffffff",
                      border: "1px solid #e4e4e7",
                      borderRadius: "8px",
                    }}
                  >
                    {events.length === 0 ? (
                      <EmptyState
                        title="Kantha Coding Assistant"
                        description={`Connected to local workspace ${workspace?.name || ""}. Cryptographically authenticated session active.`}
                      />
                    ) : (
                      <VStack gap={1}>
                        {events.map((ev, idx) => (
                          <Card key={idx}>
                            <VStack gap={1}>
                              <HStack justify="between" align="center">
                                <Badge variant="neutral" label={ev.type} />
                                <Text size="sm">
                                  {new Date(ev.timestamp).toLocaleTimeString()}
                                </Text>
                              </HStack>

                              {ev.type === "token_delta" && (
                                <Text style={{ whiteSpace: "pre-wrap" }}>{ev.text}</Text>
                              )}

                              {ev.type === "tool_call" && (
                                <Banner
                                  status="info"
                                  title={`Executing Tool: ${ev.toolName}`}
                                  description={`Parameters: ${JSON.stringify(ev.args)}`}
                                />
                              )}

                              {ev.type === "tool_result" && (
                                <Banner
                                  status={ev.isError ? "error" : "success"}
                                  title={`Tool ${ev.toolName} ${ev.isError ? "Failed" : "Succeeded"}`}
                                  description={ev.output}
                                />
                              )}
                            </VStack>
                          </Card>
                        ))}
                        <div ref={streamEndRef} />
                      </VStack>
                    )}
                  </div>

                  {/* Prompt Form */}
                  <form onSubmit={sendPrompt}>
                    <HStack gap={2} align="center">
                      <div style={{ flex: 1 }}>
                        <TextInput
                          label="Agent Prompt"
                          placeholder={
                            connectionState === "session_expired"
                              ? "Session expired - Reconnect to send prompt..."
                              : "Ask Kantha to implement a feature, inspect files, or run tests..."
                          }
                          value={prompt}
                          onChange={(val: string) => setPrompt(val)}
                          isDisabled={connectionState === "session_expired"}
                        />
                      </div>
                      <Button
                        type="submit"
                        variant="primary"
                        isDisabled={
                          !prompt.trim() ||
                          agentStatus === "running" ||
                          connectionState === "session_expired"
                        }
                        label={agentStatus === "running" ? "Thinking..." : "Send Prompt"}
                      />
                    </HStack>
                  </form>
                </VStack>
              ) : (
                <div style={{ flex: 1, minHeight: 0 }}>
                  <TerminalView sessionId={sessionId} />
                </div>
              )}
            </div>
          )}
        </div>
      </AppShell>
    </Theme>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <KanthaAstryxWorkbench />
    </QueryClientProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
