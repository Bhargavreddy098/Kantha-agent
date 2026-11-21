import crypto from "node:crypto";

export interface WebSocketLike {
  readyState: number;
  close(code?: number, reason?: string): void;
}

export interface SessionRecord {
  token: string;
  createdAt: number;
  lastAccessedAt: number;
  sockets: Set<WebSocketLike>;
}

export class SessionStore {
  private readonly sessions = new Map<string, SessionRecord>();
  public readonly cookieName: string;
  private readonly sessionTtlMs: number;

  constructor(options: { port: number; sessionTtlMs?: number }) {
    this.cookieName = `kantha_session_${options.port}`;
    this.sessionTtlMs = options.sessionTtlMs ?? 24 * 60 * 60 * 1000; // 24 hours
  }

  /**
   * Generates a 256-bit cryptographically random session token.
   */
  createSession(): string {
    const token = crypto.randomBytes(32).toString("hex");
    const now = Date.now();
    this.sessions.set(token, {
      token,
      createdAt: now,
      lastAccessedAt: now,
      sockets: new Set(),
    });
    return token;
  }

  /**
   * Validates session existence and freshness.
   */
  validateSession(token: string | undefined): boolean {
    if (!token || typeof token !== "string") {
      return false;
    }

    const session = this.sessions.get(token);
    if (!session) {
      return false;
    }

    const now = Date.now();
    if (now - session.lastAccessedAt > this.sessionTtlMs) {
      this.invalidateSession(token);
      return false;
    }

    session.lastAccessedAt = now;
    return true;
  }

  /**
   * Registers an established WebSocket connection with this session.
   * If the session expires or is invalidated, the WebSocket is forcefully terminated.
   */
  registerWebSocket(token: string, ws: WebSocketLike): void {
    const session = this.sessions.get(token);
    if (session) {
      session.sockets.add(ws);
    }
  }

  unregisterWebSocket(token: string, ws: WebSocketLike): void {
    const session = this.sessions.get(token);
    if (session) {
      session.sockets.delete(ws);
    }
  }

  /**
   * Invalidates a single session and closes all associated WebSockets immediately.
   */
  invalidateSession(token: string): void {
    const session = this.sessions.get(token);
    if (session) {
      for (const ws of session.sockets) {
        try {
          ws.close(4001, "Session expired or invalidated");
        } catch {
          // ignore
        }
      }
      session.sockets.clear();
      this.sessions.delete(token);
    }
  }

  /**
   * Daemon shutdown or restart: invalidates all sessions and terminates all WebSockets.
   */
  invalidateAll(): void {
    for (const token of Array.from(this.sessions.keys())) {
      this.invalidateSession(token);
    }
  }

  activeSessionsCount(): number {
    return this.sessions.size;
  }
}
