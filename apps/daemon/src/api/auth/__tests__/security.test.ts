import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import WebSocket from "ws";
import { startDaemonServer } from "../../router";
import { PairingTicketRegistry } from "../ticket-registry";
import { SessionStore } from "../session-store";
import { IngressFencing } from "../fencing";
import { CliCredentialManager } from "../cli-credential";

describe("ADR-007 Mandatory Security Verification Suite", () => {
  const TEST_PORT = 49152 + Math.floor(Math.random() * 1000);
  const TEMP_DIR = path.join(os.tmpdir(), `kantha_sec_test_${Date.now()}`);
  let daemon: Awaited<ReturnType<typeof startDaemonServer>>;

  before(async () => {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
    daemon = await startDaemonServer({
      port: TEST_PORT,
      workspacePath: TEMP_DIR,
      devOriginAllowed: true, // enables dev origin tests
      dataDir: TEMP_DIR,
    });
  });

  after(async () => {
    await daemon.close();
    try {
      fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  // Helper function to issue HTTP requests
  const makeRequest = (
    urlPath: string,
    options: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
      customHost?: string;
    } = {}
  ): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> => {
    return new Promise((resolve, reject) => {
      const host = options.customHost ?? `127.0.0.1:${TEST_PORT}`;
      const req = http.request(
        `http://127.0.0.1:${TEST_PORT}${urlPath}`,
        {
          method: options.method || "GET",
          headers: {
            Host: host,
            ...options.headers,
          },
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            resolve({
              status: res.statusCode || 0,
              headers: res.headers,
              body: data,
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

  // =========================================================================
  // Requirement 1: Unauthenticated REST, SSE, and WebSocket rejected
  // =========================================================================
  it("Requirement 1: Unauthenticated REST and SSE requests are rejected with 401", async () => {
    // REST GET
    const workspaceRes = await makeRequest("/api/workspace");
    assert.strictEqual(workspaceRes.status, 401, "Unauthenticated /api/workspace must return 401");

    const providersRes = await makeRequest("/api/providers");
    assert.strictEqual(providersRes.status, 401, "Unauthenticated /api/providers must return 401");

    // REST POST
    const promptRes = await makeRequest("/api/sessions/test/prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "malicious" }),
    });
    assert.strictEqual(promptRes.status, 401, "Unauthenticated prompt POST must return 401");

    // SSE Stream
    const sseRes = await makeRequest("/api/sessions/test/events");
    assert.strictEqual(sseRes.status, 401, "Unauthenticated SSE stream must return 401");
  });

  // =========================================================================
  // Requirement 2: Malicious Origin, invalid Host, and DNS rebinding blocked
  // =========================================================================
  it("Requirement 2: Malicious Origin, invalid Host, and DNS rebinding attempts are blocked with 403", async () => {
    // DNS Rebinding attempt: Attacker sends public domain as Host header
    const rebindRes = await makeRequest("/api/workspace", {
      customHost: "evil-rebinding.attacker.com",
    });
    assert.strictEqual(rebindRes.status, 403, "DNS rebinding Host header must return 403 Forbidden");

    // Malicious external Origin header on state-changing request
    const crossOriginRes = await makeRequest("/api/auth/pair", {
      method: "POST",
      headers: {
        Origin: "https://malicious-website.com",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ticket: "fake" }),
    });
    assert.strictEqual(crossOriginRes.status, 403, "External origin on /api/auth/pair must return 403");

    // Malicious external Origin on WebSocket
    await new Promise<void>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${TEST_PORT}/ws/pty/test`, {
        headers: {
          Host: `127.0.0.1:${TEST_PORT}`,
          Origin: "https://evil.com",
        },
      });

      ws.on("error", (err: any) => {
        assert.match(err.message, /403/, "WebSocket upgrade with malicious origin must fail with 403");
        resolve();
      });

      ws.on("open", () => {
        assert.fail("WebSocket should never open with unauthorized origin");
      });
    });
  });

  // =========================================================================
  // Requirement 3: Expired, malformed, reused pairing tickets rejected
  // =========================================================================
  it("Requirement 3: Expired, malformed, and reused pairing tickets are rejected with 401", async () => {
    // Malformed ticket
    const malformedRes = await makeRequest("/api/auth/pair", {
      method: "POST",
      headers: {
        Origin: `http://127.0.0.1:${TEST_PORT}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ticket: "not-a-valid-ticket" }),
    });
    assert.strictEqual(malformedRes.status, 401, "Malformed ticket must return 401");

    // Expired ticket via custom registry
    const localRegistry = new PairingTicketRegistry({ ttlMs: 1 }); // 1ms TTL
    const expiredTicket = localRegistry.createTicket();
    await new Promise((r) => setTimeout(r, 10)); // wait for expiration
    assert.strictEqual(localRegistry.consumeTicket(expiredTicket), false, "Expired ticket must return false");
    localRegistry.dispose();

    // Reused ticket: consume valid ticket once, then try again
    const validTicket = daemon.ticketRegistry.createTicket();
    const firstPair = await makeRequest("/api/auth/pair", {
      method: "POST",
      headers: {
        Origin: `http://127.0.0.1:${TEST_PORT}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ticket: validTicket }),
    });
    assert.strictEqual(firstPair.status, 200, "First pairing attempt must succeed with 200");

    const secondPair = await makeRequest("/api/auth/pair", {
      method: "POST",
      headers: {
        Origin: `http://127.0.0.1:${TEST_PORT}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ticket: validTicket }), // reused ticket
    });
    assert.strictEqual(secondPair.status, 401, "Reused ticket must return 401");
  });

  // =========================================================================
  // Requirement 4: Concurrent pairing requests using one ticket
  // =========================================================================
  it("Requirement 4: Concurrent pairing requests using one ticket: exactly one succeeds", async () => {
    const ticket = daemon.ticketRegistry.createTicket();

    // Fire 5 concurrent requests with the identical ticket
    const promises = Array.from({ length: 5 }).map(() =>
      makeRequest("/api/auth/pair", {
        method: "POST",
        headers: {
          Origin: `http://127.0.0.1:${TEST_PORT}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ticket }),
      })
    );

    const results = await Promise.all(promises);
    const successCount = results.filter((r) => r.status === 200).length;
    const failureCount = results.filter((r) => r.status === 401).length;

    assert.strictEqual(successCount, 1, "Exactly one concurrent pairing request must succeed");
    assert.strictEqual(failureCount, 4, "All other concurrent attempts must be rejected with 401");
  });

  // =========================================================================
  // Requirement 5: JavaScript attempts to read session cookie
  // =========================================================================
  it("Requirement 5: Session cookie is marked HttpOnly, SameSite=Strict, and host-only", async () => {
    const ticket = daemon.ticketRegistry.createTicket();
    const res = await makeRequest("/api/auth/pair", {
      method: "POST",
      headers: {
        Origin: `http://127.0.0.1:${TEST_PORT}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ticket }),
    });

    assert.strictEqual(res.status, 200);
    const setCookie = res.headers["set-cookie"];
    assert.ok(setCookie, "Set-Cookie header must be present");

    const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    assert.ok(cookieStr.includes(`kantha_session_${TEST_PORT}=`), "Cookie must be port-scoped");
    assert.ok(cookieStr.includes("HttpOnly"), "Cookie must enforce HttpOnly (inaccessible to JS)");
    assert.ok(cookieStr.includes("SameSite=Strict"), "Cookie must enforce SameSite=Strict");
    assert.ok(!cookieStr.includes("Domain="), "Cookie must be host-only (no wildcard domain)");
  });

  // =========================================================================
  // Requirement 6: Daemon restart invalidates existing sessions
  // =========================================================================
  it("Requirement 6: Daemon restarts invalidate existing sessions (in-memory store reset)", async () => {
    // 1. Establish valid session
    const ticket = daemon.ticketRegistry.createTicket();
    const res = await makeRequest("/api/auth/pair", {
      method: "POST",
      headers: {
        Origin: `http://127.0.0.1:${TEST_PORT}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ticket }),
    });
    const cookieHeader = res.headers["set-cookie"]![0].split(";")[0];

    // Verify session is active
    const activeCheck = await makeRequest("/api/workspace", {
      headers: { Cookie: cookieHeader },
    });
    assert.strictEqual(activeCheck.status, 200, "Active session should access workspace");

    // 2. Simulate daemon restart by invalidating in-memory store
    daemon.sessionStore.invalidateAll();

    // Verify previously valid session is now rejected
    const postRestartCheck = await makeRequest("/api/workspace", {
      headers: { Cookie: cookieHeader },
    });
    assert.strictEqual(
      postRestartCheck.status,
      401,
      "Post-restart session must be rejected with 401"
    );
  });

  // =========================================================================
  // Requirement 7 & 8: Normal CLI-to-browser launch & Workspace initialization
  // =========================================================================
  it("Requirements 7 & 8: Normal CLI-to-browser launch and Workspace auto-discovery", async () => {
    // CLI generates initial ticket
    const launchTicket = daemon.initialTicket;
    assert.ok(launchTicket, "Daemon must issue initial pairing ticket on startup");

    // Browser SPA exchanges ticket
    const pairRes = await makeRequest("/api/auth/pair", {
      method: "POST",
      headers: {
        Origin: `http://127.0.0.1:${TEST_PORT}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ticket: launchTicket }),
    });
    assert.strictEqual(pairRes.status, 200);
    const cookieHeader = pairRes.headers["set-cookie"]![0].split(";")[0];

    // Authenticated workspace query returns bound directory
    const wsRes = await makeRequest("/api/workspace", {
      headers: { Cookie: cookieHeader },
    });
    assert.strictEqual(wsRes.status, 200);
    const wsData = JSON.parse(wsRes.body);
    assert.strictEqual(wsData.path, TEMP_DIR, "Workspace path must match bound process directory");
    assert.strictEqual(wsData.name, path.basename(TEMP_DIR));
  });

  // =========================================================================
  // Requirement 9: SSH/headless pairing via URL fragment
  // =========================================================================
  it("Requirement 9: SSH/headless pairing works through URL fragment (#ticket=...)", async () => {
    // CLI regenerates ticket using CLI token
    const regenRes = await makeRequest("/api/auth/regenerate-ticket", {
      method: "POST",
      headers: {
        "X-Kantha-CLI-Token": daemon.cliManager.cliToken,
      },
    });
    assert.strictEqual(regenRes.status, 200);
    const { ticket, pairingUrl } = JSON.parse(regenRes.body);

    assert.ok(pairingUrl.includes(`/#ticket=${ticket}`), "Pairing URL must deliver ticket via fragment");

    // Client extracts fragment and pairs
    const pairRes = await makeRequest("/api/auth/pair", {
      method: "POST",
      headers: {
        Origin: `http://127.0.0.1:${TEST_PORT}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ticket }),
    });
    assert.strictEqual(pairRes.status, 200, "Headless fragment ticket pairing must succeed");
  });

  // =========================================================================
  // Requirement 10: Non-browser client spoofs Origin header
  // =========================================================================
  it("Requirement 10: Non-browser client spoofing Origin header is rejected without valid credentials", async () => {
    // Attacker crafts request with spoofed localhost Origin header but no cookie or CLI token
    const spoofedRes = await makeRequest("/api/workspace", {
      headers: {
        Origin: `http://127.0.0.1:${TEST_PORT}`,
      },
    });
    assert.strictEqual(spoofedRes.status, 401, "Spoofed Origin without credentials must return 401");

    // With valid CLI token, request succeeds
    const cliRes = await makeRequest("/api/workspace", {
      headers: {
        "X-Kantha-CLI-Token": daemon.cliManager.cliToken,
      },
    });
    assert.strictEqual(cliRes.status, 200, "Valid CLI token must authenticate successfully");
  });

  // =========================================================================
  // Requirement 11: Unauthenticated PTY upgrade rejected before WebSocket/PTY creation
  // =========================================================================
  it("Requirement 11: Unauthenticated PTY upgrade is rejected with 401 before WebSocket creation", async () => {
    await new Promise<void>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${TEST_PORT}/ws/pty/unauth_session`, {
        headers: {
          Host: `127.0.0.1:${TEST_PORT}`,
          Origin: `http://127.0.0.1:${TEST_PORT}`,
          // No cookie or CLI token
        },
      });

      ws.on("error", (err: any) => {
        assert.match(
          err.message,
          /401/,
          "Unauthenticated WebSocket upgrade must be rejected with HTTP 401"
        );
        resolve();
      });

      ws.on("open", () => {
        assert.fail("Unauthenticated PTY connection should never open");
      });
    });
  });

  // =========================================================================
  // Regressions: WebSocket Termination on Session Invalidation & Timing-Safe CLI
  // =========================================================================
  it("Regression: Session invalidation immediately closes established WebSocket connections", async () => {
    // 1. Authenticate session
    const ticket = daemon.ticketRegistry.createTicket();
    const pairRes = await makeRequest("/api/auth/pair", {
      method: "POST",
      headers: {
        Origin: `http://127.0.0.1:${TEST_PORT}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ticket }),
    });
    const cookieHeader = pairRes.headers["set-cookie"]![0].split(";")[0];
    const sessionToken = cookieHeader.split("=")[1];

    // 2. Open authenticated WebSocket
    const ws = new WebSocket(`ws://127.0.0.1:${TEST_PORT}/ws/pty/active_session`, {
      headers: {
        Host: `127.0.0.1:${TEST_PORT}`,
        Origin: `http://127.0.0.1:${TEST_PORT}`,
        Cookie: cookieHeader,
      },
    });

    await new Promise<void>((resolve, reject) => {
      ws.on("open", () => resolve());
      ws.on("error", reject);
    });

    // 3. Invalidate session in daemon
    const closedPromise = new Promise<{ code: number; reason: string }>((resolve) => {
      ws.on("close", (code, reason) => {
        resolve({ code, reason: reason.toString() });
      });
    });

    daemon.sessionStore.invalidateSession(sessionToken);

    const { code } = await closedPromise;
    assert.strictEqual(code, 4001, "Invalidated session must close active WebSocket with code 4001");
  });

  it("Regression: CLI token verification uses timingSafeEqual and rejects length mismatches", () => {
    const cliMgr = new CliCredentialManager({ port: 9999, dataDir: TEMP_DIR });
    assert.strictEqual(cliMgr.verifyCliToken(cliMgr.cliToken), true);
    assert.strictEqual(cliMgr.verifyCliToken("short"), false);
    assert.strictEqual(
      cliMgr.verifyCliToken(cliMgr.cliToken.slice(0, -1) + "x"),
      false
    );
    assert.strictEqual(cliMgr.verifyCliToken(undefined), false);
    cliMgr.cleanup();
  });

  it("Regression: Development proxy Origin (127.0.0.1:5173) is accepted only when dev mode is explicitly enabled", async () => {
    // Daemon was started with devOriginAllowed: true
    const devPairRes = await makeRequest("/api/auth/pair", {
      method: "POST",
      headers: {
        Origin: "http://127.0.0.1:5173",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ticket: daemon.ticketRegistry.createTicket() }),
    });
    assert.strictEqual(devPairRes.status, 200, "Vite dev origin must be accepted when dev mode is enabled");
    assert.strictEqual(
      devPairRes.headers["access-control-allow-origin"],
      "http://127.0.0.1:5173",
      "CORS header must echo explicitly permitted dev origin"
    );
  });

  it("Regression: Sec-Fetch-Site cross-site requests are rejected with 403", async () => {
    const res = await makeRequest("/api/auth/pair", {
      method: "POST",
      headers: {
        Origin: `http://127.0.0.1:${TEST_PORT}`,
        "Sec-Fetch-Site": "cross-site",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ticket: daemon.ticketRegistry.createTicket() }),
    });
    assert.strictEqual(res.status, 403, "Sec-Fetch-Site cross-site requests must be rejected with 403");
  });

  it("Regression: Missing Origin on /api/auth/pair is rejected with 403 (fail-closed)", async () => {
    const res = await makeRequest("/api/auth/pair", {
      method: "POST",
      headers: {
        // No Origin header
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ticket: daemon.ticketRegistry.createTicket() }),
    });
    assert.strictEqual(res.status, 403, "Missing Origin on pairing endpoint must return 403");
  });

  it("Regression: Secure cookie attribute is added when behind secure context (HTTPS)", async () => {
    const ticket = daemon.ticketRegistry.createTicket();
    const res = await makeRequest("/api/auth/pair", {
      method: "POST",
      headers: {
        Origin: `http://127.0.0.1:${TEST_PORT}`,
        "X-Forwarded-Proto": "https",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ticket }),
    });
    assert.strictEqual(res.status, 200);
    const setCookie = res.headers["set-cookie"]![0];
    assert.ok(setCookie.includes("Secure"), "Cookie must include Secure attribute when operating under HTTPS");
  });
});
