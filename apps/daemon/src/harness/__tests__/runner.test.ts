import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Effect, Layer, Stream } from "effect";
import { createKanthaDb, sessions } from "@kantha/db";
import { GatewayService } from "@kantha/gateway";
import { createDaemonGatewayLayer } from "../../services/gateway";
import { ApprovalManager } from "../../api/approvals";
import { EffectHarnessRunner } from "../runner";

describe("EffectHarnessRunner Multi-Turn Autonomous Engine", () => {
  let tmpDir: string;
  let db: any;
  let gatewayLayer: any;
  let approvalManager: ApprovalManager;

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `kantha-runner-test-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    const { db: kanthaDb } = await createKanthaDb({ dbPath: path.join(tmpDir, "kantha.sqlite") });
    db = kanthaDb;
    await db.insert(sessions).values({
      id: "s-tier4",
      title: "Test Tier 4",
      workspacePath: tmpDir,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await db.insert(sessions).values({
      id: "s-tier4-override",
      title: "Test Tier 4 Override",
      workspacePath: tmpDir,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await db.insert(sessions).values({
      id: "s-doom",
      title: "Test Doom Loop",
      workspacePath: tmpDir,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    gatewayLayer = createDaemonGatewayLayer({ db, dataDir: tmpDir });
    approvalManager = new ApprovalManager({ db });
  });

  it("blocks Tier 4 models strictly with TIER4_TOOLS_BLOCKED error when tools requested", async () => {
    const runner = new EffectHarnessRunner({
      sessionId: "s-tier4",
      workspacePath: tmpDir,
      db,
      gatewayLayer,
      approvalManager,
      modelId: "ollama:llama3.2", // Tier 4 local model
    });

    const result = await Effect.runPromise(runner.runPrompt("List all files")).catch((err) => err);
    assert.ok(result.message.includes("TIER4_TOOLS_BLOCKED"));
  });

  it("allows Tier 4 models when allowTier4Tools: true is set explicitly", async () => {
    const MockGateway = Layer.succeed(
      GatewayService,
      GatewayService.of({
        stream: () =>
          Effect.succeed(
            Stream.make({
              text: "Hello from mock Tier 4",
            })
          ),
        complete: () => Effect.die("not implemented"),
        passthrough: () => Effect.succeed(null),
        getCatalog: () => Effect.die("not implemented"),
        testConnection: () => Effect.die("not implemented"),
      })
    );

    const runner = new EffectHarnessRunner({
      sessionId: "s-tier4-override",
      workspacePath: tmpDir,
      db,
      gatewayLayer: MockGateway,
      approvalManager,
      modelId: "ollama:llama3.2",
      allowTier4Tools: true,
      autoApprove: true,
    });

    const program = runner.runPrompt("Hi");
    const output = await Effect.runPromise(program.pipe(Effect.provide(MockGateway)));
    assert.ok(typeof output === "string");
  });

  it("detects and breaks doom loops after 3 consecutive identical failing tool calls", async () => {
    const runner = new EffectHarnessRunner({
      sessionId: "s-doom",
      workspacePath: tmpDir,
      db,
      gatewayLayer,
      approvalManager,
      autoApprove: true,
      maxSteps: 10,
    });

    // Inject simulated doom loop state
    assert.equal(runner.checkDoomLoop("read_file", { filePath: "nonexistent.txt" }, true), false);
    assert.equal(runner.checkDoomLoop("read_file", { filePath: "nonexistent.txt" }, true), false);
    assert.equal(runner.checkDoomLoop("read_file", { filePath: "nonexistent.txt" }, true), true); // 3rd identical failure triggers doom loop
  });
});
