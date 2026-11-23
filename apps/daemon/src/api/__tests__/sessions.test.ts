import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { Effect, Fiber } from "effect";
import { startDaemonServer } from "../router";
import { sessions } from "@kantha/db";

describe("Daemon Sessions & Approvals HTTP API", () => {
  const TEST_PORT = 49200 + Math.floor(Math.random() * 1000);
  const TEMP_DIR = path.join(os.tmpdir(), `kantha_sess_test_${Date.now()}`);
  let daemon: Awaited<ReturnType<typeof startDaemonServer>>;
  let cookieHeader: string;

  const makeRequest = (
    urlPath: string,
    options: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
    } = {}
  ): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string; json: any }> => {
    return new Promise((resolve, reject) => {
      const headers: Record<string, string> = {
        Host: `127.0.0.1:${TEST_PORT}`,
        Origin: `http://127.0.0.1:${TEST_PORT}`,
        ...options.headers,
      };
      if (cookieHeader && !headers["Cookie"] && !headers["cookie"]) {
        headers["Cookie"] = cookieHeader;
      }

      const req = http.request(
        `http://127.0.0.1:${TEST_PORT}${urlPath}`,
        {
          method: options.method || "GET",
          headers,
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            let json = null;
            try {
              json = JSON.parse(data);
            } catch {}
            resolve({
              status: res.statusCode || 0,
              headers: res.headers,
              body: data,
              json,
            });
          });
        }
      );
      req.on("error", reject);
      if (options.body) {
        req.write(options.body);
      }
      req.end();
    });
  };

  before(async () => {
    fs.mkdirSync(TEMP_DIR, { recursive: true });

    daemon = await startDaemonServer({
      port: TEST_PORT,
      workspacePath: TEMP_DIR,
      devOriginAllowed: true,
      dataDir: TEMP_DIR,
    });

    // Exchange pairing ticket for cookie
    const pairRes = await makeRequest("/api/auth/pair", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ticket: daemon.initialTicket }),
    });
    cookieHeader = pairRes.headers["set-cookie"]![0].split(";")[0];
  });

  after(async () => {
    await daemon.close();
    try {
      fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    } catch {}
  });

  it("returns HTTP 400 Bad Request when submitting missing or empty prompt", async () => {
    const res = await makeRequest("/api/sessions/s1/prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "" }),
    });
    assert.strictEqual(res.status, 400);
    assert.ok(res.json.error.includes("empty"));
  });

  it("submits prompt successfully and returns HTTP 202 Accepted", async () => {
    // Insert session record
    await (daemon as any).db.insert(sessions).values({
      id: "s1",
      title: "Test Session 1",
      workspacePath: TEMP_DIR,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const res = await makeRequest("/api/sessions/s1/prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "Hello from test", autoApprove: true }),
    });
    assert.strictEqual(res.status, 202);
    assert.strictEqual(res.json.status, "accepted");
    assert.strictEqual(res.json.sessionId, "s1");
  });

  it("returns HTTP 409 Conflict when submitting a prompt while a session is actively running", async () => {
    // Simulate active running fiber
    (daemon as any).activeRunFibers.set("s-busy", { fiber: {} as any, runId: "r-busy" });

    const res = await makeRequest("/api/sessions/s-busy/prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "Concurrent prompt" }),
    });
    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.json.error, "Session is currently running");

    (daemon as any).activeRunFibers.delete("s-busy");
  });

  it("queries pending approvals and resolves an approval", async () => {
    const apprMgr = (daemon as any).approvalManager;
    assert.ok(apprMgr, "ApprovalManager must be accessible on daemon");

    // Start approval request in background fiber
    const approvalFiber = Effect.runFork(
      apprMgr.requestApproval({
        sessionId: "s1",
        runId: "r1",
        callId: "c_test",
        toolName: "write_file",
        args: { filePath: "test.txt", content: "hi" },
      })
    );

    // Wait 20ms for row to be persisted
    await new Promise((r) => setTimeout(r, 20));

    // Query GET /api/sessions/s1/approvals
    const getRes = await makeRequest("/api/sessions/s1/approvals");
    assert.strictEqual(getRes.status, 200);
    assert.ok(Array.isArray(getRes.json.approvals));
    assert.strictEqual(getRes.json.approvals.length, 1);
    const pendingId = getRes.json.approvals[0].id;

    // Resolve via POST /api/sessions/s1/approvals/:id
    const resolveRes = await makeRequest(`/api/sessions/s1/approvals/${pendingId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "approve" }),
    });
    assert.strictEqual(resolveRes.status, 200);
    assert.strictEqual(resolveRes.json.success, true);

    const decision: any = await Effect.runPromise(Fiber.join(approvalFiber));
    assert.strictEqual(decision.decision, "approve");
  });

  it("aborts active session via POST /api/sessions/:id/abort", async () => {
    const res = await makeRequest("/api/sessions/s1/abort", {
      method: "POST",
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.success, true);
    assert.strictEqual(res.json.aborted, true);
  });
});
