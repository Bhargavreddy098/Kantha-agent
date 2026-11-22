export interface FencingOptions {
  port: number;
  devOriginAllowed?: boolean;
  allowedOrigins?: string[];
}

export class IngressFencing {
  public readonly port: number;
  public readonly devOriginAllowed: boolean;
  public readonly allowedHosts: Set<string>;
  public readonly allowedOrigins: Set<string>;

  constructor(options: FencingOptions) {
    this.port = options.port;
    this.devOriginAllowed = Boolean(options.devOriginAllowed);

    this.allowedHosts = new Set([
      `127.0.0.1:${this.port}`,
      `localhost:${this.port}`,
      `[::1]:${this.port}`,
      // In case host has no port for default port 80
      ...(this.port === 80 ? ["127.0.0.1", "localhost", "[::1]"] : []),
    ]);

    this.allowedOrigins = new Set([
      `http://127.0.0.1:${this.port}`,
      `http://localhost:${this.port}`,
      `http://[::1]:${this.port}`,
    ]);

    // Explicitly allowed origins via options
    if (options.allowedOrigins && Array.isArray(options.allowedOrigins)) {
      for (const origin of options.allowedOrigins) {
        if (origin) {
          const norm = origin.trim().toLowerCase();
          this.allowedOrigins.add(norm);
          try {
            const parsed = new URL(norm);
            this.allowedHosts.add(parsed.host);
          } catch {
            // ignore malformed custom origin
          }
        }
      }
    }

    // Support KANTHA_ALLOWED_ORIGINS environment variable
    if (typeof process !== "undefined" && process.env?.KANTHA_ALLOWED_ORIGINS) {
      const envOrigins = process.env.KANTHA_ALLOWED_ORIGINS.split(",").map((s) => s.trim().toLowerCase());
      for (const o of envOrigins) {
        if (o) {
          this.allowedOrigins.add(o);
          try {
            const parsed = new URL(o);
            this.allowedHosts.add(parsed.host);
          } catch {
            // ignore
          }
        }
      }
    }

    if (this.devOriginAllowed) {
      // Explicitly configured development hosts and origins (Vite dev servers on port 3000-3010, 5173-5180, 4173)
      const devPorts = [3000, 3001, 3002, 5173, 5174, 5175, 5176, 4173];
      for (const p of devPorts) {
        this.allowedHosts.add(`127.0.0.1:${p}`);
        this.allowedHosts.add(`localhost:${p}`);
        this.allowedOrigins.add(`http://127.0.0.1:${p}`);
        this.allowedOrigins.add(`http://localhost:${p}`);
      }
    }
  }

  /**
   * Validates Host header against configured loopback listener.
   * Defends against DNS rebinding (e.g. Host: evil.com).
   */
  isHostValid(hostHeader: string | undefined): boolean {
    if (!hostHeader || typeof hostHeader !== "string") {
      return false;
    }

    const normalized = hostHeader.trim().toLowerCase();
    if (this.allowedHosts.has(normalized)) {
      return true;
    }

    if (this.devOriginAllowed) {
      try {
        let host = normalized;
        if (normalized.startsWith("[") && normalized.includes("]")) {
          host = normalized.substring(0, normalized.indexOf("]") + 1);
        } else if (normalized.includes(":")) {
          host = normalized.split(":")[0];
        }
        const isLoopback = host === "127.0.0.1" || host === "localhost" || host === "[::1]";
        if (isLoopback) {
          return true;
        }
      } catch {}
    }

    return false;
  }

  /**
   * Validates Origin header for browser requests and WebSocket upgrades.
   * In production, origin must be in the allowedOrigins set.
   * In development, any loopback origin (e.g. localhost, 127.0.0.1, [::1] on any port) is allowed.
   */
  isOriginValid(originHeader: string | undefined): boolean {
    if (!originHeader || typeof originHeader !== "string") {
      return false;
    }

    const normalized = originHeader.trim().toLowerCase();
    if (this.allowedOrigins.has(normalized)) {
      return true;
    }

    if (this.devOriginAllowed) {
      try {
        const parsed = new URL(normalized);
        const isLoopback =
          parsed.hostname === "127.0.0.1" ||
          parsed.hostname === "localhost" ||
          parsed.hostname === "[::1]";
        if (isLoopback && (parsed.protocol === "http:" || parsed.protocol === "https:")) {
          return true;
        }
      } catch {
        // malformed origin URL
      }
    }

    return false;
  }

  /**
   * Validates Sec-Fetch-Site header (Defense in Depth).
   * Rejects requests explicitly flagged as cross-site by the browser.
   */
  isFetchSiteValid(secFetchSite: string | undefined): boolean {
    if (!secFetchSite) {
      return true; // Not sent by non-browser or older browser
    }
    const normalized = secFetchSite.trim().toLowerCase();
    return normalized === "same-origin" || normalized === "same-site" || normalized === "none";
  }

  /**
   * Extracts kantha_session_<port> cookie from Cookie header.
   */
  extractSessionCookie(cookieHeader: string | undefined): string | null {
    if (!cookieHeader || typeof cookieHeader !== "string") {
      return null;
    }

    const targetKey = `kantha_session_${this.port}`;
    const pairs = cookieHeader.split(";");

    for (const pair of pairs) {
      const [key, value] = pair.trim().split("=");
      if (key === targetKey && value) {
        return decodeURIComponent(value);
      }
    }

    return null;
  }
}
