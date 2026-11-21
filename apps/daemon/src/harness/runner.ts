import { Effect } from "effect";
import { toolRegistry } from "./tools";
import type { KanthaEvent } from "@kantha/protocol";
import fs from "node:fs";
import path from "node:path";

export interface RunnerOptions {
  sessionId: string;
  workspacePath: string;
  maxSteps?: number;
  onEvent?: (event: KanthaEvent) => void;
}

export class EffectHarnessRunner {
  private sessionId: string;
  private workspacePath: string;
  private onEvent?: (event: KanthaEvent) => void;
  private jsonlPath: string;

  constructor(options: RunnerOptions) {
    this.sessionId = options.sessionId;
    this.workspacePath = options.workspacePath;
    this.onEvent = options.onEvent;

    const baseDir = process.env.KANTHA_DATA_DIR
      ? path.join(process.env.KANTHA_DATA_DIR, "sessions", this.sessionId)
      : path.resolve(process.cwd(), ".kantha-data", "sessions", this.sessionId);

    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }
    this.jsonlPath = path.join(baseDir, "events.jsonl");
  }

  private emit(event: KanthaEvent) {
    fs.appendFileSync(this.jsonlPath, JSON.stringify(event) + "\n", "utf-8");
    this.onEvent?.(event);
  }

  /**
   * Executes the prompt inside an Effect fiber loop.
   */
  runPrompt(prompt: string): Effect.Effect<string, Error> {
    return Effect.gen(this, function* (_) {
      const now = Date.now();

      this.emit({
        type: "status_change",
        sessionId: this.sessionId,
        status: "running",
        timestamp: now,
      });

      this.emit({
        type: "token_delta",
        sessionId: this.sessionId,
        text: `Starting prompt: ${prompt}\n`,
        timestamp: now,
      });

      const callId = `call_${Date.now()}`;
      this.emit({
        type: "tool_call",
        sessionId: this.sessionId,
        callId,
        toolName: "list_files",
        args: { directoryPath: "." },
        timestamp: Date.now(),
      });

      const listTool = toolRegistry.get("list_files");
      let toolOutput: any = { files: [] };
      if (listTool) {
        toolOutput = yield* _(
          Effect.tryPromise({
            try: () => listTool.execute({ directoryPath: "." }, { workspacePath: this.workspacePath }),
            catch: (err) => new Error(`Tool execution failed: ${err}`),
          })
        );
      }

      this.emit({
        type: "tool_result",
        sessionId: this.sessionId,
        callId,
        toolName: "list_files",
        output: JSON.stringify(toolOutput),
        isError: false,
        timestamp: Date.now(),
      });

      const assistantMsg = `Kantha processed workspace at ${this.workspacePath}. Found ${toolOutput.files?.length || 0} entries.`;
      this.emit({
        type: "token_delta",
        sessionId: this.sessionId,
        text: assistantMsg,
        timestamp: Date.now(),
      });

      this.emit({
        type: "status_change",
        sessionId: this.sessionId,
        status: "completed",
        timestamp: Date.now(),
      });

      return assistantMsg;
    });
  }
}
