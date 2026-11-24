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

    // Support KANTHA_ALLOWED_ORIGINS, APP_URL, and SHARED_APP_URL environment variables
    if (typeof process !== "undefined" && process.env) {
      const envOriginList: string[] = [];
      if (process.env.KANTHA_ALLOWED_ORIGINS) {
        envOriginList.push(...process.env.KANTHA_ALLOWED_ORIGINS.split(","));
      }
      if (process.env.APP_URL) {
        envOriginList.push(process.env.APP_URL);
      }
      if (process.env.SHARED_APP_URL) {
        envOriginList.push(process.env.SHARED_APP_URL);
      }
      for (const raw of envOriginList) {
        const o = raw.trim().toLowerCase().replace(/\/+$/, "");
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
      // Explicitly configured frontend development hosts and origins (Vite dev server on ports 3000-3004, 5173-5176, 4173)
      const devPorts = [3000, 3001, 3002, 3003, 3004, 5173, 5174, 5175, 5176, 4173];
      for (const p of devPorts) {
        this.allowedHosts.add(`127.0.0.1:${p}`);
        this.allowedHosts.add(`localhost:${p}`);
        this.allowedHosts.add(`[::1]:${p}`);
        this.allowedOrigins.add(`http://127.0.0.1:${p}`);
        this.allowedOrigins.add(`http://localhost:${p}`);
        this.allowedOrigins.add(`http://[::1]:${p}`);
      }
    }
  }

  private isTrustedPreviewHost(host: string): boolean {
    if (!this.devOriginAllowed) return false;
    return /^ais-(dev|pre)-[a-z0-9-]+\.[a-z0-9-]+\.run\.app$/i.test(host);
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
    return this.allowedHosts.has(normalized) || this.isTrustedPreviewHost(normalized);
  }

  /**
   * Validates Origin header for browser requests and WebSocket upgrades.
   * Enforces exact match against allowedOrigins allowlist.
   */
  isOriginValid(originHeader: string | undefined): boolean {
    if (!originHeader || typeof originHeader !== "string") {
      return false;
    }

    const normalized = originHeader.trim().toLowerCase().replace(/\/+$/, "");
    if (this.allowedOrigins.has(normalized)) {
      return true;
    }
    try {
      const parsed = new URL(normalized);
      if (parsed.protocol === "https:" && this.isTrustedPreviewHost(parsed.host)) {
        return true;
      }
    } catch {
      // invalid URL
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
