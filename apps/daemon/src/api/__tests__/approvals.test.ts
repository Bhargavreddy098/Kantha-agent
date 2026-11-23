import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Effect } from "effect";
import { createKanthaDb, approvals, sessions, eq } from "@kantha/db";
import { ApprovalManager } from "../approvals";

describe("ApprovalManager Lifecycle & Gating", () => {
  let tmpDir: string;
  let db: any;
  let manager: ApprovalManager;

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `kantha-approvals-test-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    const { db: kanthaDb } = await createKanthaDb({ dbPath: path.join(tmpDir, "kantha.sqlite") });
    db = kanthaDb;
    await db.insert(sessions).values({
      id: "s1",
      title: "Test Session",
      workspacePath: tmpDir,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    manager = new ApprovalManager({ db });
  });

  it("auto-approves read-only tools immediately", async () => {
    const decision = await Effect.runPromise(
      manager.requestApproval({
        sessionId: "s1",
        runId: "r1",
        callId: "c1",
        toolName: "read_file",
        args: { filePath: "test.txt" },
      })
    );
    assert.equal(decision.decision, "approve");
  });

  it("auto-approves mutating tools when autoApprove: true is passed", async () => {
    const decision = await Effect.runPromise(
      manager.requestApproval({
        sessionId: "s1",
        runId: "r1",
        callId: "c1_auto",
        toolName: "write_file",
        args: { filePath: "test.txt", content: "data" },
        autoApprove: true,
      })
    );
    assert.equal(decision.decision, "approve");
  });

  it("suspends mutating tools on ask policy and resolves when approved", async () => {
    const promise = Effect.runPromise(
      manager.requestApproval({
        sessionId: "s1",
        runId: "r1",
        callId: "c2",
        toolName: "write_file",
        args: { filePath: "test.txt", content: "hello" },
      })
    );

    // Verify pending record in SQLite
    const pending = await manager.getPendingApprovals("s1");
    assert.equal(pending.length, 1);
    assert.equal(pending[0].toolName, "write_file");
    assert.equal(pending[0].status, "pending");

    // Resolve approval
    await manager.resolveApproval(pending[0].id, "approve");
    const result = await promise;
    assert.equal(result.decision, "approve");

    const rows = await db.select().from(approvals).where(eq(approvals.id, pending[0].id));
    assert.equal(rows[0].status, "approved");
  });

  it("cancels pending approvals on run abort with cancelled status", async () => {
    const promise = Effect.runPromise(
      manager.requestApproval({
        sessionId: "s1",
        runId: "r1",
        callId: "c3",
        toolName: "execute_command",
        args: { command: "rm -rf test" },
      })
    );

    await manager.cancelPendingApprovals("s1", "r1");
    const result = await promise;
    assert.equal(result.decision, "reject");

    const pending = await manager.getPendingApprovals("s1");
    assert.equal(pending.length, 0);

    const rows = await db.select().from(approvals).where(eq(approvals.callId, "c3"));
    assert.equal(rows[0].status, "cancelled");
  });

  it("marks expired approvals as timed_out", async () => {
    const promise = Effect.runPromise(
      manager.requestApproval({
        sessionId: "s1",
        runId: "r1",
        callId: "c4",
        toolName: "write_file",
        args: { filePath: "slow.txt", content: "..." },
        timeoutMs: 50, // fast timeout for test
      })
    );

    const result = await promise;
    assert.equal(result.decision, "reject");
    assert.ok(result.feedback?.includes("timed out"));

    const rows = await db.select().from(approvals).where(eq(approvals.callId, "c4"));
    assert.equal(rows[0].status, "timed_out");
  });
});
