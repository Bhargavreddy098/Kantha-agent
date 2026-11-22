import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import child_process from "node:child_process";
import { WebSocketServer } from "ws";
import { createKanthaDb } from "@kantha/db";
import { EffectHarnessRunner } from "../harness/runner";
import { ptyManager } from "../pty/manager";
import type { KanthaEvent } from "@kantha/protocol";
import { Effect } from "effect";
import {
  PairingTicketRegistry,
  SessionStore,
  CliCredentialManager,
  IngressFencing,
} from "./auth";
import { handleChatStreamRequest } from "./chat";

export interface DaemonServerOptions {
  port?: number;
  dbPath?: string;
  workspacePath?: string;
  devOriginAllowed?: boolean;
  dataDir?: string;
}

export async function startDaemonServer(options: DaemonServerOptions = {}) {
  const port = options.port || 4000;
  const workspacePath = options.workspacePath || process.cwd();
  const dataDir =
    options.dataDir ||
    process.env.KANTHA_DATA_DIR ||
    path.resolve(workspacePath, ".kantha-data");
  const { db } = await createKanthaDb({ dbPath: options.dbPath });

  const isDev =
    options.devOriginAllowed ??
    (process.env.NODE_ENV === "development" ||
      process.env.KANTHA_DEV_PROXY === "true");

  // In-memory authentication components per ADR-007
  const ticketRegistry = new PairingTicketRegistry({ ttlMs: 60_000 });
  const sessionStore = new SessionStore({ port });
  const cliManager = new CliCredentialManager({ port, dataDir });
  const fencing = new IngressFencing({ port, devOriginAllowed: isDev });

  const initialTicket = ticketRegistry.createTicket();

  // Workspace and git repository discovery
  const discoverWorkspace = () => {
    let gitBranch = "detached";
    let isGitRepo = false;
    let modifiedFilesCount = 0;
    try {
      const gitHeadPath = path.join(workspacePath, ".git", "HEAD");
      if (fs.existsSync(gitHeadPath)) {
        const headContent = fs.readFileSync(gitHeadPath, "utf-8").trim();
        const match = headContent.match(/^ref: refs\/heads\/(.+)$/);
        gitBranch = match ? match[1] : "detached";
        isGitRepo = true;

        try {
          const statusOutput = child_process.execSync("git status --porcelain", {
            cwd: workspacePath,
            encoding: "utf-8",
            stdio: ["ignore", "pipe", "ignore"],
            timeout: 2000,
          });
          modifiedFilesCount = statusOutput.trim().split("\n").filter(Boolean).length;
        } catch {
          // git command failed or timed out
        }
      }
    } catch {
      // Non-git folder
    }

    return {
      name: path.basename(workspacePath),
      path: workspacePath,
      gitBranch,
      isGitRepo,
      modifiedFilesCount,
      timestamp: Date.now(),
    };
  };

  // Discover configured model providers
  const discoverProviders = () => {
    const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
    const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);

    return {
      defaultModel: hasAnthropic
        ? "anthropic:claude-3-7-sonnet"
        : hasOpenAI
        ? "openai:gpt-4o"
        : "ollama:llama3.2",
      providers: [
        {
          id: "anthropic",
          name: "Anthropic Claude",
          configured: hasAnthropic,
          models: [
            { id: "claude-3-7-sonnet", name: "Claude 3.7 Sonnet (Thinking)" },
            { id: "claude-3-5-sonnet", name: "Claude 3.5 Sonnet" },
          ],
        },
        {
          id: "openai",
          name: "OpenAI",
          configured: hasOpenAI,
          models: [
            { id: "gpt-4o", name: "GPT-4o" },
            { id: "o3-mini", name: "o3-mini" },
          ],
        },
        {
          id: "ollama",
          name: "Ollama (Local Inference)",
          configured: true,
          models: [
            { id: "llama3.2", name: "Llama 3.2 (Local)" },
            { id: "deepseek-r1", name: "DeepSeek R1 (Local)" },
            { id: "qwen2.5-coder", name: "Qwen 2.5 Coder (Local)" },
          ],
        },
      ],
    };
  };

  // Event stream listeners per session
  const eventListeners = new Map<string, Set<(event: KanthaEvent) => void>>();
  const activeSseResponses = new Set<http.ServerResponse>();

  const broadcastEvent = (sessionId: string, event: KanthaEvent) => {
    const listeners = eventListeners.get(sessionId);
    if (listeners) {
      for (const listener of listeners) {
        listener(event);
      }
    }
  };

  /**
   * Universal Request Authenticator:
   * Validates either the host-only kantha_session_<port> cookie OR the X-Kantha-CLI-Token header.
   */
  const authenticateRequest = (req: http.IncomingMessage): boolean => {
    // 1. Check browser session cookie
    const sessionCookie = fencing.extractSessionCookie(req.headers.cookie);
    if (sessionCookie && sessionStore.validateSession(sessionCookie)) {
      return true;
    }

    // 2. Check direct CLI authorization token (timing-safe)
    const cliHeader = req.headers["x-kantha-cli-token"];
    if (typeof cliHeader === "string" && cliManager.verifyCliToken(cliHeader)) {
      return true;
    }

    return false;
  };

  const server = http.createServer(async (req, res) => {
    // 1. Mandatory Fail-Closed Host Validation (Defending against DNS Rebinding)
    if (!fencing.isHostValid(req.headers.host)) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Forbidden: Invalid Host header" }));
      return;
    }

    // 1b. Defense in Depth: Sec-Fetch-Site Validation
    if (!fencing.isFetchSiteValid(req.headers["sec-fetch-site"] as string | undefined)) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Forbidden: Cross-site request rejected" }));
      return;
    }

    // 2. Strict Origin Fencing (Eliminating wildcard CORS)
    const origin = req.headers.origin;
    if (origin) {
      if (fencing.isOriginValid(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Credentials", "true");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Kantha-CLI-Token");
      } else {
        // Cross-origin attempt from untrusted origin
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Forbidden: Unauthorized Origin" }));
        return;
      }
    }

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
    const pathname = url.pathname;

    // Health check endpoint (Readiness probes)
    if (pathname === "/health" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "healthy", timestamp: Date.now() }));
      return;
    }

    // =========================================================================
    // ADR-007: Automatic Local Session Authentication — Pairing Endpoint
    // =========================================================================
    if (pathname === "/api/auth/pair" && req.method === "POST") {
      // Browser pairing requires Origin validation (fail-closed)
      if (!origin || !fencing.isOriginValid(origin)) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Forbidden: Untrusted or missing Origin" }));
        return;
      }

      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const payload = body ? JSON.parse(body) : {};
          const ticket = payload.ticket;

          // Synchronous atomic delete-on-read consumption
          const isValidTicket = ticketRegistry.consumeTicket(ticket);
          if (!isValidTicket) {
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                error: "Unauthorized: Invalid, expired, or already used pairing ticket",
              })
            );
            return;
          }

          // Create fresh session in in-memory store
          const sessionToken = sessionStore.createSession();
          const isSecure = req.headers["x-forwarded-proto"] === "https" || Boolean((req.socket as any).encrypted);
          const secureAttr = isSecure ? "; Secure" : "";

          // Set HttpOnly, SameSite=Strict, host-only cookie
          res.writeHead(200, {
            "Content-Type": "application/json",
            "Set-Cookie": `${sessionStore.cookieName}=${sessionToken}; Path=/; HttpOnly; SameSite=Strict${secureAttr}`,
          });
          res.end(
            JSON.stringify({
              authenticated: true,
              cookieName: sessionStore.cookieName,
              workspace: discoverWorkspace(),
            })
          );
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Malformed request payload" }));
        }
      });
      return;
    }

    // Regenerate Pairing Ticket (for `kantha open` or authenticated UI reconnect)
    if (pathname === "/api/auth/regenerate-ticket" && req.method === "POST") {
      if (!authenticateRequest(req)) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized: Valid session or CLI token required" }));
        return;
      }

      // If called from a browser without CLI token, require valid Origin
      const cliHeader = req.headers["x-kantha-cli-token"];
      const isCli = typeof cliHeader === "string" && cliManager.verifyCliToken(cliHeader);
      if (!isCli && (!origin || !fencing.isOriginValid(origin))) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Forbidden: Unauthorized or missing Origin" }));
        return;
      }

      const newTicket = ticketRegistry.createTicket();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ticket: newTicket,
          pairingUrl: `http://127.0.0.1:${port}/#ticket=${newTicket}`,
        })
      );
      return;
    }

    // Automated Local Session Handshake (for local workbench dev)
    // Verifies the origin is trusted local dev (127.0.0.1 / localhost) and sets session cookie
    if (pathname === "/api/auth/handshake" && req.method === "GET") {
      if (origin && !fencing.isOriginValid(origin)) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Forbidden: Unauthorized Origin" }));
        return;
      }

      const existingCookie = fencing.extractSessionCookie(req.headers.cookie);
      let sessionToken =
        existingCookie && sessionStore.validateSession(existingCookie)
          ? existingCookie
          : null;

      if (!sessionToken) {
        sessionToken = sessionStore.createSession();
      }

      const isSecure =
        req.headers["x-forwarded-proto"] === "https" ||
        Boolean((req.socket as any).encrypted);
      const secureAttr = isSecure ? "; Secure" : "";

      res.writeHead(200, {
        "Content-Type": "application/json",
        "Set-Cookie": `${sessionStore.cookieName}=${sessionToken}; Path=/; HttpOnly; SameSite=Lax${secureAttr}`,
      });
      res.end(
        JSON.stringify({
          authenticated: true,
          method: "local-session",
          workspace: discoverWorkspace(),
        })
      );
      return;
    }

    // Session Status Verification endpoint
    if (pathname === "/api/auth/session" && req.method === "GET") {
      if (!authenticateRequest(req)) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ authenticated: false }));
        return;
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ authenticated: true, workspace: discoverWorkspace() }));
      return;
    }

    // Logout endpoint
    if (pathname === "/api/auth/logout" && req.method === "POST") {
      const sessionCookie = fencing.extractSessionCookie(req.headers.cookie);
      if (sessionCookie) {
        sessionStore.invalidateSession(sessionCookie);
      }

      res.writeHead(200, {
        "Content-Type": "application/json",
        "Set-Cookie": `${sessionStore.cookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`,
      });
      res.end(JSON.stringify({ authenticated: false }));
      return;
    }

    // =========================================================================
    // Protected Application Endpoints — Require Valid Session or CLI Token
    // =========================================================================
    if (!authenticateRequest(req)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized: Valid session or CLI token required" }));
      return;
    }

    // Enforce Origin check for state-changing browser requests (fail-closed unless valid CLI token)
    const cliHeader = req.headers["x-kantha-cli-token"];
    const isCli = typeof cliHeader === "string" && cliManager.verifyCliToken(cliHeader);
    if ((req.method === "POST" || req.method === "PUT" || req.method === "DELETE") && !isCli) {
      if (!origin || !fencing.isOriginValid(origin)) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Forbidden: Unauthorized or missing Origin" }));
        return;
      }
    }

    // Workspace Auto-Discovery
    if (pathname === "/api/workspace" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(discoverWorkspace()));
      return;
    }

    // Model Providers Auto-Discovery
    if (pathname === "/api/providers" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(discoverProviders()));
      return;
    }

    // OpenAI-compatible Chat Streaming with Reasoning Separation
    if (pathname === "/api/chat/stream" && req.method === "POST") {
      await handleChatStreamRequest(req, res);
      return;
    }

    // Sessions API
    const dataDir = options.dataDir || process.env.KANTHA_DATA_DIR || path.resolve(workspacePath, ".kantha-data");
    if (pathname === "/api/sessions" && req.method === "GET") {
      const sessionsDir = path.join(dataDir, "sessions");
      const sessionsList: Array<{ id: string; title: string; updatedAt: number }> = [];
      if (fs.existsSync(sessionsDir)) {
        try {
          const entries = fs.readdirSync(sessionsDir);
          for (const entry of entries) {
            const entryPath = path.join(sessionsDir, entry);
            const stat = fs.statSync(entryPath);
            if (stat.isDirectory()) {
              sessionsList.push({
                id: entry,
                title: `Task Session ${entry.replace("session_", "")}`,
                updatedAt: stat.mtimeMs,
              });
            }
          }
        } catch {
          // ignore
        }
      }
      sessionsList.sort((a, b) => b.updatedAt - a.updatedAt);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ sessions: sessionsList }));
      return;
    }

    if (pathname === "/api/sessions" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        const payload = body ? JSON.parse(body) : {};
        const id = `session_${Date.now()}`;
        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            id,
            title: payload.title || "Active Workspace Session",
            workspacePath: payload.workspacePath || workspacePath,
            status: "idle",
            createdAt: Date.now(),
            updatedAt: Date.now(),
          })
        );
      });
      return;
    }

    // SSE Stream endpoint
    const sseMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/events$/);
    if (sseMatch && req.method === "GET") {
      const sessionId = sseMatch[1];
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write("data: " + JSON.stringify({ type: "connected", sessionId }) + "\n\n");

      activeSseResponses.add(res);
      if (!eventListeners.has(sessionId)) {
        eventListeners.set(sessionId, new Set());
      }
      const listener = (event: KanthaEvent) => {
        res.write("data: " + JSON.stringify(event) + "\n\n");
      };
      eventListeners.get(sessionId)!.add(listener);

      req.on("close", () => {
        activeSseResponses.delete(res);
        eventListeners.get(sessionId)?.delete(listener);
      });
      return;
    }

    // Prompt submission
    const promptMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/prompt$/);
    if (promptMatch && req.method === "POST") {
      const sessionId = promptMatch[1];
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        const { prompt } = JSON.parse(body || "{}");
        const runner = new EffectHarnessRunner({
          sessionId,
          workspacePath,
          onEvent: (event: KanthaEvent) => broadcastEvent(sessionId, event),
        });

        // Run asynchronously via Effect
        Effect.runPromise(runner.runPrompt(prompt || "Hello Kantha"));

        res.writeHead(202, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "accepted", sessionId }));
      });
      return;
    }

    // Production static SPA file serving (same-origin, zero CORS)
    if (!pathname.startsWith("/api") && !pathname.startsWith("/ws")) {
      const webDistPath = path.resolve(process.cwd(), "apps/web/dist");
      const candidatePath = pathname === "/" ? path.join(webDistPath, "index.html") : path.join(webDistPath, pathname);
      if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
        const ext = path.extname(candidatePath).toLowerCase();
        const mimeTypes: Record<string, string> = {
          ".html": "text/html",
          ".js": "text/javascript",
          ".css": "text/css",
          ".json": "application/json",
          ".svg": "image/svg+xml",
          ".woff2": "font/woff2",
        };
        res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
        fs.createReadStream(candidatePath).pipe(res);
        return;
      }
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  // =========================================================================
  // WebSocket Server: Pre-Upgrade Rejection & Session Lifecycle Tracking
  // =========================================================================
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    // 1. Host Validation
    if (!fencing.isHostValid(req.headers.host)) {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }

    // 2. Origin Validation
    const origin = req.headers.origin;
    if (!origin || !fencing.isOriginValid(origin)) {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }

    // 3. Credential Validation (Session cookie OR CLI Token)
    const sessionCookie = fencing.extractSessionCookie(req.headers.cookie);
    const cliToken = req.headers["x-kantha-cli-token"];
    const isSessionValid = sessionCookie ? sessionStore.validateSession(sessionCookie) : false;
    const isCliValid = typeof cliToken === "string" ? cliManager.verifyCliToken(cliToken) : false;

    if (!isSessionValid && !isCliValid) {
      socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }

    // 4. Path Validation
    const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
    const match = url.pathname.match(/^\/ws\/pty\/([^/]+)$/);
    if (!match) {
      socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }

    const sessionId = match[1];

    // Complete WebSocket upgrade
    wss.handleUpgrade(req, socket, head, (ws) => {
      // Track connection so session expiration closes the WebSocket
      if (sessionCookie) {
        sessionStore.registerWebSocket(sessionCookie, ws);
        ws.on("close", () => {
          sessionStore.unregisterWebSocket(sessionCookie, ws);
        });
      }

      const ptySession = ptyManager.createSession(sessionId, { cwd: workspacePath });

      ptySession.onData((chunk) => {
        if (ws.readyState === ws.OPEN) {
          ws.send(chunk);
        }
      });

      ws.on("message", (msg) => {
        ptySession.write(msg.toString());
      });

      ws.on("close", () => {
        ptySession.kill();
      });
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      console.log(`[Kantha Daemon] Running on http://127.0.0.1:${port}`);
      console.log(`[Kantha Daemon] Workspace bound to: ${workspacePath}`);
      console.log(`[Kantha Daemon] CLI token registered: ${cliManager.tokenPath}`);
      console.log(
        `[Kantha Daemon] Browser Pairing URL: http://127.0.0.1:${port}/#ticket=${initialTicket}`
      );
      resolve();
    });
  });

  const close = async () => {
    ticketRegistry.dispose();
    sessionStore.invalidateAll();
    cliManager.cleanup();

    for (const sseRes of activeSseResponses) {
      try {
        sseRes.write("event: error\ndata: " + JSON.stringify({ error: "session_expired" }) + "\n\n");
        sseRes.end();
      } catch {
        // ignore
      }
    }
    activeSseResponses.clear();

    await new Promise<void>((resolve) => {
      wss.close(() => {
        server.close(() => resolve());
      });
    });
  };

  return {
    server,
    wss,
    port,
    ticketRegistry,
    sessionStore,
    cliManager,
    fencing,
    initialTicket,
    workspace: discoverWorkspace(),
    close,
  };
}
