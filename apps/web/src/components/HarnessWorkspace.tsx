import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Badge,
  Banner,
  Button,
  Card,
  ChatLayout,
  ChatMessage,
  ChatMessageBubble,
  ChatMessageList,
  ChatToolCalls,
  ClickableCard,
  CodeBlock,
  Divider,
  Grid,
  Heading,
  HStack,
  MetadataList,
  MetadataListItem,
  ProgressBar,
  ScrollableArea,
  Step,
  Stepper,
  Switch,
  Text,
  VStack,
  type ChatToolCallItem,
} from "@astryxdesign/core";
import {
  ArrowUpRight,
  Check,
  FolderSearch,
  GitBranch,
  Layers,
  Plus,
  ShieldAlert,
  Wrench,
  X,
} from "lucide-react";
import { Composer } from "./Composer";
import { SwissMarkdown } from "./SwissMarkdown";
import { ThinkingPanel } from "./ThinkingPanel";
import { harnessService, type PlanStepItem } from "../services/harnessService";
import type { ProvidersDataResponse } from "../services/providerService";

export interface HarnessWorkspaceProps {
  selectedModel: string;
  onSelectModel: (modelId: string) => void;
  providersData: ProvidersDataResponse | null;
  onOpenSettings: () => void;
  initialPrompt?: string | null;
  onClearInitialPrompt?: () => void;
}

interface LiveToolCall {
  callId: string;
  toolName: string;
  args: Record<string, unknown>;
  status: "pending" | "running" | "complete" | "error";
  output?: string;
  startedAt: number;
  durationMs?: number;
}

interface PendingApprovalItem {
  approvalId: string;
  callId: string;
  toolName: string;
  args: Record<string, unknown>;
}

interface HarnessTurn {
  id: string;
  prompt: string;
  startedAt: number;
  assistantText: string;
  reasoning: string;
  toolCalls: LiveToolCall[];
  status: "running" | "completed" | "failed" | "interrupted";
}

const STARTER_TASKS = [
  {
    index: "01",
    icon: FolderSearch,
    title: "Workspace Architecture Audit",
    description: "Inspect root packages, scripts, and git state using read-only workspace tools.",
    prompt:
      "Use inspect_workspace and git_status to inspect this repository, then present a concise architectural summary of its packages and apps.",
  },
  {
    index: "02",
    icon: Layers,
    title: "Gateway Resilience Trace",
    description: "Locate circuit-breaker and failover logic across packages/gateway using search tools.",
    prompt:
      "Use glob_files and grep_search to locate the gateway resilience implementation in packages/gateway, read the key functions, and summarize how failover and retries work.",
  },
  {
    index: "03",
    icon: GitBranch,
    title: "Harness Tooling Inventory",
    description: "Read apps/daemon/src/harness/tools.ts and verify all registered tools and safety gates.",
    prompt:
      "Read apps/daemon/src/harness/tools.ts and summarize every registered tool, its category, risk level, and approval policy in a markdown table.",
  },
];

function summarizeArgsTarget(args: Record<string, unknown>): string | undefined {
  const candidate =
    args.filePath ||
    args.path ||
    args.directoryPath ||
    args.pattern ||
    args.command;
  if (typeof candidate === "string" && candidate.trim()) {
    return candidate.length > 64 ? `${candidate.slice(0, 61)}...` : candidate;
  }
  return undefined;
}

function mapStepStatus(status: PlanStepItem["status"]): "accent" | "success" | "warning" | "error" | undefined {
  if (status === "completed") return "success";
  if (status === "in_progress") return "accent";
  if (status === "failed") return "error";
  if (status === "skipped") return "warning";
  return undefined;
}

export const HarnessWorkspace: React.FC<HarnessWorkspaceProps> = ({
  selectedModel,
  onSelectModel,
  providersData,
  onOpenSettings,
  initialPrompt,
  onClearInitialPrompt,
}) => {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [turns, setTurns] = useState<HarnessTurn[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [phase, setPhase] = useState<string>("idle");
  const [phaseDetail, setPhaseDetail] = useState<string>("Ready for workspace task");
  const [planSteps, setPlanSteps] = useState<PlanStepItem[]>([
    { id: "plan_inspect", title: "Inspect workspace & gather context", status: "pending" },
    { id: "plan_execute", title: "Execute targeted tools & operations", status: "pending" },
    { id: "plan_verify", title: "Verify results & synthesize final answer", status: "pending" },
  ]);
  const [stepProgress, setStepProgress] = useState<{ current: number; max: number }>({
    current: 0,
    max: 12,
  });
  const [usageStats, setUsageStats] = useState({
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    toolCount: 0,
  });
  const [pendingApprovals, setPendingApprovals] = useState<PendingApprovalItem[]>([]);
  const [autoApprove, setAutoApprove] = useState(false);
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const activeTurnIdRef = useRef<string | null>(null);
  const consumedInitialRef = useRef<string | null>(null);

  const closeStream = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      closeStream();
    };
  }, [closeStream]);

  const attachEventStream = useCallback(
    (sid: string) => {
      closeStream();
      const es = new EventSource(`/api/sessions/${encodeURIComponent(sid)}/events`, {
        withCredentials: true,
      });
      eventSourceRef.current = es;

      es.onmessage = (msgEvent) => {
        try {
          const evt = JSON.parse(msgEvent.data);
          const turnId = activeTurnIdRef.current;

          if (evt.type === "orchestrator_phase") {
            setPhase(evt.phase || "executing");
            if (evt.detail) setPhaseDetail(evt.detail);
          } else if (evt.type === "plan_update" && Array.isArray(evt.steps)) {
            setPlanSteps(evt.steps);
          } else if (evt.type === "step_started") {
            setStepProgress({
              current: (evt.stepIndex ?? 0) + 1,
              max: evt.maxSteps ?? 12,
            });
          } else if (evt.type === "gateway_fallback") {
            setFallbackNotice(
              `Gateway failed over from ${evt.fromModelId} → ${evt.toModelId} (${evt.reason})`
            );
          } else if (evt.type === "approval_required") {
            setPendingApprovals((prev) => {
              if (prev.some((a) => a.approvalId === evt.approvalId)) return prev;
              return [
                ...prev,
                {
                  approvalId: evt.approvalId,
                  callId: evt.callId,
                  toolName: evt.toolName,
                  args: evt.args || {},
                },
              ];
            });
          } else if (evt.type === "token_delta" && evt.text && turnId) {
            setTurns((prev) =>
              prev.map((t) =>
                t.id === turnId ? { ...t, assistantText: t.assistantText + evt.text } : t
              )
            );
          } else if (evt.type === "reasoning_delta" && turnId) {
            const deltaText = evt.delta || evt.text || "";
            if (deltaText) {
              setTurns((prev) =>
                prev.map((t) =>
                  t.id === turnId ? { ...t, reasoning: t.reasoning + deltaText } : t
                )
              );
            }
          } else if (evt.type === "tool_call" && turnId) {
            setUsageStats((u) => ({ ...u, toolCount: u.toolCount + 1 }));
            setTurns((prev) =>
              prev.map((t) => {
                if (t.id !== turnId) return t;
                if (t.toolCalls.some((c) => c.callId === evt.callId)) return t;
                return {
                  ...t,
                  toolCalls: [
                    ...t.toolCalls,
                    {
                      callId: evt.callId,
                      toolName: evt.toolName,
                      args: evt.args || {},
                      status: "running",
                      startedAt: Date.now(),
                    },
                  ],
                };
              })
            );
          } else if (evt.type === "tool_result" && turnId) {
            setPendingApprovals((prev) => prev.filter((a) => a.callId !== evt.callId));
            setTurns((prev) =>
              prev.map((t) => {
                if (t.id !== turnId) return t;
                return {
                  ...t,
                  toolCalls: t.toolCalls.map((c) =>
                    c.callId === evt.callId
                      ? {
                          ...c,
                          status: evt.isError ? "error" : "complete",
                          output:
                            typeof evt.output === "string"
                              ? evt.output
                              : JSON.stringify(evt.output, null, 2),
                          durationMs: Math.max(1, Date.now() - c.startedAt),
                        }
                      : c
                  ),
                };
              })
            );
          } else if (evt.type === "turn_usage") {
            setUsageStats((u) => ({
              ...u,
              inputTokens: u.inputTokens + Number(evt.inputTokens || 0),
              outputTokens: u.outputTokens + Number(evt.outputTokens || 0),
              costUsd: u.costUsd + Number(evt.costUsd || 0),
            }));
          } else if (evt.type === "status_change") {
            if (evt.status === "completed" || evt.status === "failed" || evt.status === "interrupted") {
              setIsRunning(false);
              setPendingApprovals([]);
              if (turnId) {
                setTurns((prev) =>
                  prev.map((t) => (t.id === turnId ? { ...t, status: evt.status } : t))
                );
              }
            }
          }
        } catch {
          // Ignore malformed event
        }
      };

      es.onerror = () => {
        // Native EventSource reconnects automatically unless closed
      };
    },
    [closeStream]
  );

  const handleSubmitPrompt = useCallback(
    async (promptText: string) => {
      const clean = promptText.trim();
      if (!clean || isRunning) return;

      setErrorBanner(null);
      setFallbackNotice(null);

      try {
        let sid = sessionId;
        if (!sid) {
          const created = await harnessService.createSession(clean.slice(0, 72));
          sid = created.id;
          setSessionId(sid);
          attachEventStream(sid);
          // Give EventSource a brief tick to subscribe before launching
          await new Promise((r) => setTimeout(r, 120));
        }

        const turnId = `turn_${Date.now()}`;
        activeTurnIdRef.current = turnId;
        setIsRunning(true);
        setPhase("planning");
        setPhaseDetail("Dispatching task to orchestrator");
        setStepProgress({ current: 1, max: 12 });

        setTurns((prev) => [
          ...prev,
          {
            id: turnId,
            prompt: clean,
            startedAt: Date.now(),
            assistantText: "",
            reasoning: "",
            toolCalls: [],
            status: "running",
          },
        ]);

        let explicitProviderId: string | undefined;
        let cleanModelId = selectedModel;
        for (const p of providersData?.providers || []) {
          if (selectedModel.startsWith(`${p.id}:`)) {
            explicitProviderId = p.id;
            cleanModelId = selectedModel.slice(p.id.length + 1);
            break;
          }
        }

        await harnessService.submitPrompt(sid, {
          prompt: clean,
          providerId: explicitProviderId,
          modelId: cleanModelId,
          autoApprove,
          maxSteps: 12,
        });
      } catch (err: any) {
        setIsRunning(false);
        setPhase("failed");
        setErrorBanner(err?.message || "Failed to start harness run");
      }
    },
    [sessionId, isRunning, attachEventStream, selectedModel, providersData, autoApprove]
  );

  // Auto-run initialPrompt passed from WelcomeScreen "Run Workspace Audit"
  useEffect(() => {
    if (initialPrompt && consumedInitialRef.current !== initialPrompt && !isRunning) {
      consumedInitialRef.current = initialPrompt;
      handleSubmitPrompt(initialPrompt);
      onClearInitialPrompt?.();
    }
  }, [initialPrompt, isRunning, handleSubmitPrompt, onClearInitialPrompt]);

  const handleAbort = async () => {
    if (!sessionId) return;
    try {
      await harnessService.abortSession(sessionId);
    } catch {}
    setIsRunning(false);
    setPhase("interrupted");
    setPhaseDetail("Run aborted by user");
    setPendingApprovals([]);
  };

  const handleResetSession = () => {
    if (isRunning && sessionId) {
      harnessService.abortSession(sessionId).catch(() => {});
    }
    closeStream();
    setSessionId(null);
    setTurns([]);
    setIsRunning(false);
    setPhase("idle");
    setPhaseDetail("Ready for workspace task");
    setStepProgress({ current: 0, max: 12 });
    setUsageStats({ inputTokens: 0, outputTokens: 0, costUsd: 0, toolCount: 0 });
    setPendingApprovals([]);
    setFallbackNotice(null);
    setErrorBanner(null);
    setPlanSteps([
      { id: "plan_inspect", title: "Inspect workspace & gather context", status: "pending" },
      { id: "plan_execute", title: "Execute targeted tools & operations", status: "pending" },
      { id: "plan_verify", title: "Verify results & synthesize final answer", status: "pending" },
    ]);
  };

  const handleResolveApproval = async (approvalId: string, decision: "approve" | "reject") => {
    if (!sessionId) return;
    try {
      await harnessService.resolveApproval(sessionId, approvalId, decision);
      setPendingApprovals((prev) => prev.filter((a) => a.approvalId !== approvalId));
    } catch (err: any) {
      setErrorBanner(err?.message || "Failed to resolve approval");
    }
  };

  const activeStepIdx = Math.max(
    0,
    planSteps.findIndex((s) => s.status === "in_progress") !== -1
      ? planSteps.findIndex((s) => s.status === "in_progress")
      : planSteps.filter((s) => s.status === "completed").length
  );

  const phaseBadgeVariant =
    phase === "completed"
      ? "success"
      : phase === "failed"
      ? "error"
      : phase === "interrupted"
      ? "warning"
      : phase === "idle"
      ? "neutral"
      : "info";

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) 316px",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        backgroundColor: "var(--swiss-bg)",
      }}
    >
      {/* Left Main Autonomous Execution Column */}
      <div
        style={{
          height: "100%",
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          borderRight: "1px solid var(--swiss-border)",
        }}
      >
        <ChatLayout
          density="balanced"
          composer={
            <VStack gap="8px" style={{ width: "100%", maxWidth: "880px", margin: "0 auto" }}>
              {pendingApprovals.map((appr) => (
                <Banner
                  key={appr.approvalId}
                  status="warning"
                  title={`Approval required: ${appr.toolName}`}
                  description={
                    <Text
                      size="xs"
                      style={{
                        fontFamily: "var(--font-mono)",
                        wordBreak: "break-word",
                      }}
                    >
                      {JSON.stringify(appr.args)}
                    </Text>
                  }
                  icon={<ShieldAlert size={16} />}
                  endContent={
                    <HStack gap="6px">
                      <Button
                        label="Approve tool execution"
                        variant="primary"
                        size="sm"
                        icon={<Check size={13} />}
                        onClick={() => handleResolveApproval(appr.approvalId, "approve")}
                      >
                        Approve
                      </Button>
                      <Button
                        label="Reject tool execution"
                        variant="destructive"
                        size="sm"
                        icon={<X size={13} />}
                        onClick={() => handleResolveApproval(appr.approvalId, "reject")}
                      >
                        Reject
                      </Button>
                    </HStack>
                  }
                />
              ))}

              {fallbackNotice && (
                <Banner
                  status="info"
                  title="Gateway Failover Activated"
                  description={fallbackNotice}
                  isDismissable
                  onDismiss={() => setFallbackNotice(null)}
                />
              )}

              {errorBanner && (
                <Banner
                  status="error"
                  title="Orchestrator Error"
                  description={errorBanner}
                  isDismissable
                  onDismiss={() => setErrorBanner(null)}
                />
              )}

              <Composer
                onSubmit={(text) => handleSubmitPrompt(text)}
                onStop={handleAbort}
                isGenerating={isRunning}
                selectedModel={selectedModel}
                onSelectModel={onSelectModel}
                providersData={providersData}
                onOpenSettings={onOpenSettings}
                hideAttachments
                placeholder="Assign an autonomous workspace task (read, search, git, edit, or run tests)..."
              />
            </VStack>
          }
        >
          {turns.length === 0 ? (
            <VStack
              gap="24px"
              style={{
                maxWidth: "840px",
                margin: "0 auto",
                padding: "40px 28px 28px 28px",
                width: "100%",
              }}
            >
              <VStack gap="10px">
                <Text
                  size="xs"
                  weight="semibold"
                  style={{
                    fontFamily: "var(--font-mono)",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: "var(--swiss-accent)",
                  }}
                >
                  HARNESS ORCHESTRATOR — PLAN / EXECUTE / VERIFY
                </Text>
                <Heading
                  level={1}
                  style={{
                    fontSize: "30px",
                    lineHeight: 1.15,
                    letterSpacing: "-0.03em",
                    fontWeight: 700,
                    margin: 0,
                  }}
                >
                  Autonomous workspace execution with durable safety gates.
                </Heading>
                <Text size="sm" style={{ color: "var(--swiss-text-secondary)", maxWidth: "600px" }}>
                  Read-only tools batch in parallel automatically. Mutating file writes and shell
                  commands pause for explicit approval unless Auto-Approve is enabled.
                </Text>
              </VStack>

              <Divider />

              <VStack gap="12px" style={{ width: "100%" }}>
                <Text
                  size="xs"
                  weight="semibold"
                  style={{
                    fontFamily: "var(--font-mono)",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "var(--swiss-text-secondary)",
                  }}
                >
                  WORKSPACE BENCHMARK TASKS
                </Text>

                <Grid columns={{ minWidth: 240, max: 3 }} gap={12} width="100%">
                  {STARTER_TASKS.map((task) => {
                    const Icon = task.icon;
                    return (
                      <ClickableCard
                        key={task.title}
                        label={task.title}
                        variant="default"
                        padding={16}
                        onClick={() => handleSubmitPrompt(task.prompt)}
                        style={{
                          border: "1px solid var(--swiss-border)",
                          borderRadius: "2px",
                          backgroundColor: "var(--swiss-surface)",
                        }}
                      >
                        <VStack gap="10px">
                          <HStack justify="space-between" align="center" style={{ width: "100%" }}>
                            <HStack gap="8px" align="center">
                              <Text
                                size="xs"
                                hasTabularNumbers
                                weight="semibold"
                                style={{
                                  fontFamily: "var(--font-mono)",
                                  color: "var(--swiss-accent)",
                                }}
                              >
                                {task.index}
                              </Text>
                              <Icon size={15} />
                            </HStack>
                            <ArrowUpRight size={14} style={{ color: "var(--swiss-text-secondary)" }} />
                          </HStack>
                          <VStack gap="4px">
                            <Text size="sm" weight="semibold">
                              {task.title}
                            </Text>
                            <Text size="xs" style={{ color: "var(--swiss-text-secondary)", lineHeight: 1.5 }}>
                              {task.description}
                            </Text>
                          </VStack>
                        </VStack>
                      </ClickableCard>
                    );
                  })}
                </Grid>
              </VStack>
            </VStack>
          ) : (
            <div
              style={{
                maxWidth: "840px",
                margin: "0 auto",
                padding: "20px 24px 72px 24px",
                width: "100%",
              }}
            >
              <ChatMessageList>
                {turns.map((turn) => {
                  const mappedCalls: ChatToolCallItem[] = turn.toolCalls.map((tc) => ({
                    key: tc.callId,
                    name: tc.toolName,
                    status: tc.status,
                    target: summarizeArgsTarget(tc.args),
                    duration: tc.durationMs ? `${tc.durationMs}ms` : undefined,
                    errorMessage: tc.status === "error" ? tc.output?.slice(0, 160) : undefined,
                    resultDetail: tc.output ? (
                      <CodeBlock
                        code={
                          tc.output.length > 2400
                            ? `${tc.output.slice(0, 2400)}\n... [truncated in view]`
                            : tc.output
                        }
                        language="json"
                        maxHeight={220}
                        hasCopyButton
                      />
                    ) : undefined,
                  }));

                  return (
                    <React.Fragment key={turn.id}>
                      <div style={{ padding: "14px 0 0 0" }}>
                        <ChatMessage
                          sender="user"
                          name={
                            <Text
                              size="xs"
                              weight="semibold"
                              style={{
                                fontFamily: "var(--font-mono)",
                                letterSpacing: "0.08em",
                                textTransform: "uppercase",
                              }}
                            >
                              TASK SPECIFICATION
                            </Text>
                          }
                        >
                          <ChatMessageBubble variant="ghost" width="100%">
                            <Text size="md" style={{ whiteSpace: "pre-wrap" }}>
                              {turn.prompt}
                            </Text>
                          </ChatMessageBubble>
                        </ChatMessage>
                      </div>

                      <div style={{ padding: "14px 0 18px 0" }}>
                        <ChatMessage
                          sender="assistant"
                          name={
                            <HStack align="center" gap="8px">
                              <Text
                                size="xs"
                                weight="semibold"
                                style={{
                                  fontFamily: "var(--font-mono)",
                                  letterSpacing: "0.08em",
                                  textTransform: "uppercase",
                                  color: "var(--swiss-accent)",
                                }}
                              >
                                ORCHESTRATOR RUN
                              </Text>
                              <Badge
                                label={turn.status.toUpperCase()}
                                variant={
                                  turn.status === "completed"
                                    ? "success"
                                    : turn.status === "failed"
                                    ? "error"
                                    : turn.status === "interrupted"
                                    ? "warning"
                                    : "info"
                                }
                              />
                            </HStack>
                          }
                        >
                          <ChatMessageBubble variant="ghost" width="100%">
                            <VStack gap="12px" style={{ width: "100%" }}>
                              {(turn.reasoning || (turn.status === "running" && !turn.assistantText && turn.toolCalls.length === 0)) && (
                                <ThinkingPanel
                                  reasoning={turn.reasoning}
                                  isStreaming={turn.status === "running"}
                                />
                              )}

                              {mappedCalls.length > 0 && (
                                <ChatToolCalls
                                  calls={mappedCalls}
                                  label={`${mappedCalls.length} workspace tool ${
                                    mappedCalls.length === 1 ? "call" : "calls"
                                  }`}
                                  defaultIsExpanded
                                />
                              )}

                              {turn.assistantText ? (
                                <SwissMarkdown content={turn.assistantText} />
                              ) : turn.status === "running" ? (
                                <Text
                                  size="xs"
                                  style={{
                                    fontFamily: "var(--font-mono)",
                                    color: "var(--swiss-text-secondary)",
                                  }}
                                >
                                  {phaseDetail}
                                </Text>
                              ) : null}
                            </VStack>
                          </ChatMessageBubble>
                        </ChatMessage>
                      </div>
                      <Divider />
                    </React.Fragment>
                  );
                })}
              </ChatMessageList>
            </div>
          )}
        </ChatLayout>
      </div>

      {/* Right Swiss Orchestrator Telemetry & Plan Rail */}
      <ScrollableArea
        label="Orchestrator telemetry rail"
        style={{
          height: "100%",
          backgroundColor: "var(--swiss-surface)",
          padding: "16px",
        }}
      >
        <VStack gap="16px">
          <HStack justify="space-between" align="center" style={{ width: "100%" }}>
            <Text
              size="xs"
              weight="bold"
              style={{
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              ORCHESTRATOR STATE
            </Text>
            <Button
              label="New harness session"
              variant="secondary"
              size="sm"
              icon={<Plus size={13} />}
              onClick={handleResetSession}
            >
              Reset
            </Button>
          </HStack>

          <Card
            variant="muted"
            padding={12}
            style={{ border: "1px solid var(--swiss-border)", borderRadius: "2px" }}
          >
            <VStack gap="10px">
              <HStack justify="space-between" align="center" style={{ width: "100%" }}>
                <Text
                  size="xs"
                  style={{
                    fontFamily: "var(--font-mono)",
                    color: "var(--swiss-text-secondary)",
                  }}
                >
                  PHASE
                </Text>
                <Badge label={phase.toUpperCase()} variant={phaseBadgeVariant} />
              </HStack>

              <Text size="xs" style={{ color: "var(--swiss-text-secondary)", lineHeight: 1.45 }}>
                {phaseDetail}
              </Text>

              <ProgressBar
                label="Step budget"
                value={stepProgress.current}
                max={stepProgress.max}
                hasValueLabel
                formatValueLabel={(v, m) => `Step ${v} / ${m}`}
              />
            </VStack>
          </Card>

          <Divider />

          <VStack gap="8px">
            <Text
              size="xs"
              weight="bold"
              style={{
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--swiss-text-secondary)",
              }}
            >
              EXECUTION PLAN
            </Text>

            <Stepper
              activeStep={activeStepIdx}
              orientation="vertical"
              density="compact"
              label="Orchestrator execution plan"
            >
              {planSteps.map((step, idx) => (
                <Step
                  key={step.id}
                  step={idx}
                  label={step.title}
                  description={step.detail}
                  status={mapStepStatus(step.status)}
                />
              ))}
            </Stepper>
          </VStack>

          <Divider />

          <VStack gap="10px">
            <Text
              size="xs"
              weight="bold"
              style={{
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--swiss-text-secondary)",
              }}
            >
              SAFETY &amp; APPROVALS
            </Text>

            <Switch
              label="Auto-approve write & exec tools"
              description="Read-only tools always execute automatically."
              value={autoApprove}
              onChange={(checked) => setAutoApprove(checked)}
              size="sm"
            />
          </VStack>

          <Divider />

          <MetadataList title="Run Metrics" columns="single">
            <MetadataListItem label="Session ID">
              <Text size="xs" style={{ fontFamily: "var(--font-mono)" }}>
                {sessionId ? sessionId.slice(0, 20) : "Unassigned"}
              </Text>
            </MetadataListItem>
            <MetadataListItem label="Tools Invoked" icon={<Wrench size={12} />}>
              <Text size="xs" hasTabularNumbers style={{ fontFamily: "var(--font-mono)" }}>
                {usageStats.toolCount}
              </Text>
            </MetadataListItem>
            <MetadataListItem label="Input Tokens">
              <Text size="xs" hasTabularNumbers style={{ fontFamily: "var(--font-mono)" }}>
                {usageStats.inputTokens.toLocaleString()}
              </Text>
            </MetadataListItem>
            <MetadataListItem label="Output Tokens">
              <Text size="xs" hasTabularNumbers style={{ fontFamily: "var(--font-mono)" }}>
                {usageStats.outputTokens.toLocaleString()}
              </Text>
            </MetadataListItem>
            <MetadataListItem label="Estimated Cost">
              <Text size="xs" hasTabularNumbers style={{ fontFamily: "var(--font-mono)" }}>
                ${usageStats.costUsd.toFixed(4)}
              </Text>
            </MetadataListItem>
          </MetadataList>
        </VStack>
      </ScrollableArea>
    </div>
  );
};
