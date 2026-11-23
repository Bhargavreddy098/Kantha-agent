import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Effect, Layer, Stream } from "effect";
import { GatewayService, type KanthaMessage, type KanthaTool } from "@kantha/gateway";
import { checkpoints, sessionEvents, sessions, eq, desc } from "@kantha/db";
import type { KanthaEvent } from "@kantha/protocol";
import { toolRegistry } from "./tools";
import type { ApprovalManager, ToolApprovalDecision } from "../api/approvals";

export interface RunnerOptions {
  sessionId: string;
  workspacePath: string;
  db?: any;
  gatewayLayer?: any;
  approvalManager?: ApprovalManager;
  modelId?: string;
  providerId?: string;
  allowTier4Tools?: boolean;
  autoApprove?: boolean;
  maxSteps?: number;
  onEvent?: (event: KanthaEvent) => void;
}

export class EffectHarnessRunner {
  readonly sessionId: string;
  readonly workspacePath: string;
  private db?: any;
  private gatewayLayer?: any;
  private approvalManager?: ApprovalManager;
  readonly modelId?: string;
  readonly providerId?: string;
  readonly allowTier4Tools: boolean;
  readonly autoApprove: boolean;
  readonly maxSteps: number;
  private onEvent?: (event: KanthaEvent) => void;
  private jsonlPath: string;

  private lastFailureSignature: string | null = null;
  private failureCount: number = 0;
  private eventSequence: number = 0;

  constructor(options: RunnerOptions) {
    this.sessionId = options.sessionId;
    this.workspacePath = options.workspacePath;
    this.db = options.db;
    this.gatewayLayer = options.gatewayLayer;
    this.approvalManager = options.approvalManager;
    this.modelId = options.modelId;
    this.providerId = options.providerId;
    this.allowTier4Tools = options.allowTier4Tools ?? false;
    this.autoApprove = options.autoApprove ?? false;
    this.maxSteps = options.maxSteps ?? 15;
    this.onEvent = options.onEvent;

    const baseDir = process.env.KANTHA_DATA_DIR
      ? path.join(process.env.KANTHA_DATA_DIR, "sessions", this.sessionId)
      : path.resolve(process.cwd(), ".kantha-data", "sessions", this.sessionId);

    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }
    this.jsonlPath = path.join(baseDir, "events.jsonl");
  }

  isTier4Model(): boolean {
    const id = (this.modelId || "").toLowerCase();
    const prov = (this.providerId || "").toLowerCase();
    if (id.startsWith("ollama:") || prov === "ollama") return true;
    if (id.includes("llama3.2") || id.includes("llama3:8b")) return true;
    return false;
  }

  checkDoomLoop(toolName: string, args: Record<string, unknown>, isFailure: boolean): boolean {
    if (!isFailure) {
      this.lastFailureSignature = null;
      this.failureCount = 0;
      return false;
    }
    const sig = `${toolName}:${JSON.stringify(args)}`;
    if (sig === this.lastFailureSignature) {
      this.failureCount++;
    } else {
      this.lastFailureSignature = sig;
      this.failureCount = 1;
    }
    return this.failureCount >= 3;
  }

  private emit(event: KanthaEvent) {
    try {
      fs.appendFileSync(this.jsonlPath, JSON.stringify(event) + "\n", "utf-8");
    } catch {}

    if (this.db) {
      const evtId = `evt_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
      this.db
        .insert(sessionEvents)
        .values({
          id: evtId,
          sessionId: this.sessionId,
          sequence: ++this.eventSequence,
          eventType: event.type,
          payload: JSON.stringify(event),
          createdAt: Date.now(),
        })
        .catch(() => {});
    }

    this.onEvent?.(event);
  }

  runPrompt(prompt: string): Effect.Effect<string, Error> {
    const runId = `run_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

    // Option B Strict Tier 4 block
    if (this.isTier4Model() && !this.allowTier4Tools) {
      return Effect.fail(
        new Error(
          "TIER4_TOOLS_BLOCKED: Model does not reliably support autonomous tool calling. Pass allowTier4Tools: true to override."
        )
      );
    }

    const self = this;

    const program = Effect.gen(function* () {
      const now = Date.now();

      self.emit({
        type: "status_change",
        sessionId: self.sessionId,
        status: "running",
        timestamp: now,
      });

      // Update session status in DB
      if (self.db) {
        yield* Effect.promise(() =>
          self.db
            .update(sessions)
            .set({ status: "running", updatedAt: Date.now() })
            .where(eq(sessions.id, self.sessionId))
        );
      }

      // Rehydrate messages from last checkpoint if exists
      let messages: KanthaMessage[] = [];
      let currentGeneration = 0;

      if (self.db) {
        const lastCheckpoints = (yield* Effect.promise(() =>
          self.db
            .select()
            .from(checkpoints)
            .where(eq(checkpoints.sessionId, self.sessionId))
            .orderBy(desc(checkpoints.generation), desc(checkpoints.stepIndex))
            .limit(1)
        )) as any[];

        if (lastCheckpoints.length > 0) {
          try {
            const parsed = JSON.parse(lastCheckpoints[0].stateSnapshot);
            if (Array.isArray(parsed?.messages)) {
              messages = parsed.messages;
              currentGeneration = (lastCheckpoints[0].generation ?? 0) + 1;
            }
          } catch {}
        }
      }

      // Append user prompt
      messages.push({
        role: "user",
        content: prompt,
      });

      self.emit({
        type: "token_delta",
        sessionId: self.sessionId,
        text: `Starting prompt: ${prompt}\n`,
        timestamp: now,
      });

      let finalOutput = "";

      // Multi-turn step loop
      for (let stepIndex = 0; stepIndex < self.maxSteps; stepIndex++) {
        self.emit({
          type: "step_started",
          sessionId: self.sessionId,
          stepIndex,
          maxSteps: self.maxSteps,
          timestamp: Date.now(),
        } as any);

        // Check if gateway service is available
        const gateway = yield* Effect.serviceOption(GatewayService);

        if (gateway._tag === "None") {
          // Fallback simple path when Gateway is not in context
          const listTool = toolRegistry.get("list_files");
          let toolOutput: any = { files: [] };
          if (listTool) {
            toolOutput = yield* Effect.tryPromise({
              try: () =>
                listTool.execute(
                  { directoryPath: "." },
                  { workspacePath: self.workspacePath }
                ),
              catch: (err) => new Error(`Tool execution failed: ${err}`),
            });
          }
          finalOutput = `Kantha processed workspace at ${self.workspacePath}. Found ${toolOutput.files?.length || 0} entries.`;
          break;
        }

        // Available tools definitions
        const availableTools: KanthaTool[] = Array.from(toolRegistry.values()).map(
          (t) => ({
            name: t.name,
            description: t.description,
            parameters: {
              type: "object",
              properties: {},
            },
          })
        );

        const inferenceStream = yield* gateway.value.stream({
          providerId: self.providerId || "default",
          modelId: self.modelId || "default",
          messages,
          tools: availableTools,
          attribution: {
            sessionId: self.sessionId,
            turnId: `${runId}_${stepIndex}`,
          },
        });

        let assistantText = "";
        const toolCallsToExecute: Array<{
          id: string;
          name: string;
          args: Record<string, unknown>;
        }> = [];

        // Consume inference stream
        yield* Stream.runForEach(inferenceStream, (delta) =>
          Effect.sync(() => {
            if (delta.text) {
              assistantText += delta.text;
              self.emit({
                type: "token_delta",
                sessionId: self.sessionId,
                text: delta.text,
                timestamp: Date.now(),
              });
            }
            if (delta.reasonings && delta.reasonings.length > 0) {
              for (const r of delta.reasonings) {
                if (r.text) {
                  self.emit({
                    type: "reasoning_delta",
                    sessionId: self.sessionId,
                    text: r.text,
                    timestamp: Date.now(),
                  } as any);
                }
              }
            }
            if (delta.toolCalls && delta.toolCalls.length > 0) {
              for (const tc of delta.toolCalls) {
                toolCallsToExecute.push({
                  id: tc.id,
                  name: tc.name,
                  args: (tc.arguments as Record<string, unknown>) ?? {},
                });
              }
            }
            if (delta.finishReason && delta.usage) {
              self.emit({
                type: "turn_usage",
                sessionId: self.sessionId,
                stepIndex,
                modelId: self.modelId || "default",
                tier: 1,
                inputTokens: delta.usage.inputTokens ?? 0,
                outputTokens: delta.usage.outputTokens ?? 0,
                reasoningTokens: delta.usage.reasoningTokens ?? 0,
                costUsd: delta.costUsd ?? 0,
                timestamp: Date.now(),
              } as any);
            }
          })
        );

        if (assistantText) {
          messages.push({
            role: "assistant",
            content: assistantText,
          });
          finalOutput = assistantText;
        }

        // If no tool calls requested, the assistant turn is complete
        if (toolCallsToExecute.length === 0) {
          break;
        }

        // Execute tool calls
        let hitDoomLoop = false;
        for (const tc of toolCallsToExecute) {
          const actionId = `action_${runId}_${tc.id}`;

          self.emit({
            type: "tool_intent",
            sessionId: self.sessionId,
            callId: tc.id,
            toolName: tc.name,
            args: tc.args,
            runId,
            actionId,
            timestamp: Date.now(),
          } as any);

          self.emit({
            type: "tool_call",
            sessionId: self.sessionId,
            callId: tc.id,
            toolName: tc.name,
            args: tc.args,
            timestamp: Date.now(),
          });

          // Approval check
          let approvalDecision: ToolApprovalDecision = { decision: "approve" };
          if (self.approvalManager) {
            approvalDecision = yield* self.approvalManager.requestApproval({
              sessionId: self.sessionId,
              runId,
              callId: tc.id,
              toolName: tc.name,
              args: tc.args,
              autoApprove: self.autoApprove,
            });
          }

          if (approvalDecision.decision === "reject") {
            const errorMsg = `Tool execution rejected: ${approvalDecision.feedback ?? "Approval denied"}`;
            self.emit({
              type: "tool_result",
              sessionId: self.sessionId,
              callId: tc.id,
              toolName: tc.name,
              output: errorMsg,
              isError: true,
              timestamp: Date.now(),
            });

            messages.push({
              role: "tool",
              content: errorMsg,
              toolCallId: tc.id,
            } as any);

            if (self.checkDoomLoop(tc.name, tc.args, true)) {
              hitDoomLoop = true;
              break;
            }
            continue;
          }

          const tool = toolRegistry.get(tc.name);
          let toolResult: any;
          let isError = false;

          if (!tool) {
            toolResult = { error: `Tool ${tc.name} is not registered` };
            isError = true;
          } else {
            try {
              toolResult = yield* Effect.tryPromise({
                try: () =>
                  tool.execute(tc.args, { workspacePath: self.workspacePath }),
                catch: (err: any) => new Error(err.message || String(err)),
              });
            } catch (err: any) {
              toolResult = { error: err.message || String(err) };
              isError = true;
            }
          }

          const outputStr =
            typeof toolResult === "string"
              ? toolResult
              : JSON.stringify(toolResult);

          self.emit({
            type: "tool_result",
            sessionId: self.sessionId,
            callId: tc.id,
            toolName: tc.name,
            output: outputStr,
            isError,
            timestamp: Date.now(),
          });

          messages.push({
            role: "tool",
            content: outputStr,
            toolCallId: tc.id,
          } as any);

          if (self.checkDoomLoop(tc.name, tc.args, isError)) {
            hitDoomLoop = true;
            break;
          }
        }

        // Save step checkpoint in SQLite
        if (self.db) {
          const chkId = `chk_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
          yield* Effect.promise(() =>
            self.db.insert(checkpoints).values({
              id: chkId,
              sessionId: self.sessionId,
              generation: currentGeneration,
              stepIndex,
              stateSnapshot: JSON.stringify({ messages }),
              createdAt: Date.now(),
            })
          );
        }

        if (hitDoomLoop) {
          const doomMsg = "Execution halted: doom loop detected after 3 consecutive identical failing tool calls.";
          self.emit({
            type: "token_delta",
            sessionId: self.sessionId,
            text: `\n${doomMsg}\n`,
            timestamp: Date.now(),
          });
          finalOutput = doomMsg;
          break;
        }
      }

      self.emit({
        type: "status_change",
        sessionId: self.sessionId,
        status: "completed",
        timestamp: Date.now(),
      });

      if (self.db) {
        yield* Effect.promise(() =>
          self.db
            .update(sessions)
            .set({ status: "completed", updatedAt: Date.now() })
            .where(eq(sessions.id, self.sessionId))
        );
      }

      return finalOutput;
    });

    return Effect.scoped(
      program.pipe(
        Effect.onInterrupt(() =>
          Effect.promise(async () => {
            if (self.approvalManager) {
              await self.approvalManager.cancelPendingApprovals(self.sessionId, runId);
            }
            if (self.db) {
              await self.db
                .update(sessions)
                .set({ status: "interrupted", updatedAt: Date.now() })
                .where(eq(sessions.id, self.sessionId));
            }
          })
        )
      )
    ) as Effect.Effect<string, Error>;
  }
}
