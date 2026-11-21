export interface FencingOptions {
  port: number;
  devOriginAllowed?: boolean;
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
      // In case host has no port for default port 80
      ...(this.port === 80 ? ["127.0.0.1", "localhost"] : []),
    ]);

    this.allowedOrigins = new Set([
      `http://127.0.0.1:${this.port}`,
      `http://localhost:${this.port}`,
    ]);

    if (this.devOriginAllowed) {
      // Explicitly configured development hosts and origins (Vite dev servers on port 3000 or 5173)
      this.allowedHosts.add("127.0.0.1:3000");
      this.allowedHosts.add("localhost:3000");
      this.allowedHosts.add("127.0.0.1:5173");
      this.allowedHosts.add("localhost:5173");
      this.allowedOrigins.add("http://127.0.0.1:5173");
      this.allowedOrigins.add("http://localhost:5173");
      this.allowedOrigins.add("http://127.0.0.1:3000");
      this.allowedOrigins.add("http://localhost:3000");
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
    return this.allowedHosts.has(normalized);
  }

  /**
   * Validates Origin header for browser requests and WebSocket upgrades.
   * If origin is present, it must be in the allowedOrigins set.
   */
  isOriginValid(originHeader: string | undefined): boolean {
    if (!originHeader || typeof originHeader !== "string") {
      return false;
    }

    const normalized = originHeader.trim().toLowerCase();
    return this.allowedOrigins.has(normalized);
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
