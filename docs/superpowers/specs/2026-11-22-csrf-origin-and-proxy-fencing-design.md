# Design Document: CSRF Origin Fallback & Dev Proxy Fencing Resolution

**Date:** 2026-11-22  
**Status:** Pending Approval  
**Target:** `apps/daemon`, `apps/web`  

---

## 1. Intent and Why

When configuring custom model providers or testing connections in the Kantha Settings modal, the browser issues a `POST` request to `http://127.0.0.1:3000/api/providers/discover` (proxied via Vite on port 3000 to the Bun/Node daemon on port 4000). The request currently fails with:

```text
Request URL: http://127.0.0.1:3000/api/providers/discover
Request Method: POST
Status Code: 403 Forbidden
```

### Root Cause
1. **Omitted `Origin` Header on Same-Origin Requests:** Modern browser engines (Chromium, Firefox, Safari) often omit the `Origin` header on same-origin `POST` requests, sending only `Referer: http://127.0.0.1:3000/` and `Sec-Fetch-Site: same-origin`. In [`apps/daemon/src/api/router.ts`](file:///C:/Users/bharg/OneDrive/Desktop/kantha-agent/apps/daemon/src/api/router.ts), line 377 strictly enforces `if (!origin || !fencing.isOriginValid(origin))`. If `origin` is omitted by the browser/proxy, the request is unconditionally rejected with `403 Forbidden`.
2. **`Sec-Fetch-Site: cross-site` with `localhost` vs `127.0.0.1`:** If a developer opens `http://localhost:3000` while Vite proxies or connects to `127.0.0.1`, browsers classify the request as `cross-site`. Line 177 (`isFetchSiteValid`) rejected this prior to origin evaluation.
3. **Vite Proxy Origin Passthrough:** The Vite dev proxy in [`apps/web/vite.config.ts`](file:///C:/Users/bharg/OneDrive/Desktop/kantha-agent/apps/web/vite.config.ts) was not synthesizing or preserving the `Origin` header when forwarding upstream.
4. **Daemon Hot-Reloading:** The daemon dev command in [`apps/daemon/package.json`](file:///C:/Users/bharg/OneDrive/Desktop/kantha-agent/apps/daemon/package.json) used `tsx src/index.ts` instead of `tsx watch src/index.ts`, preventing code changes from reloading without manual process restarts.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- Resolve effective origin reliably from `Origin`, falling back to `Referer` or `Host` when `Sec-Fetch-Site` is `same-origin`.
- Tolerate browser-classified `Sec-Fetch-Site: cross-site` requests in development mode when the origin is a verified loopback address (`localhost`, `127.0.0.1`, `[::1]`).
- Ensure Vite dev proxy injects/preserves the client `Origin` header when forwarding `/api` calls upstream.
- Update `apps/daemon/package.json` to `"dev": "tsx watch src/index.ts"`.
- Maintain strict fail-closed ADR-007 protection: non-loopback external domains (e.g. `https://malicious.com`) remain strictly blocked with `403`.

### Non-Goals
- Exposing the daemon to external public networks.
- Removing CSRF or origin fencing checks entirely.
- Changing authentication mechanics (session cookies and CLI tokens remain standard).

### Anti-Goals
- Weakening security by removing origin verification from state-changing endpoints.
- Introducing third-party CORS middleware packages.
- Breaking existing SSE streaming or document extraction endpoints.

---

## 3. Constraints
- Must pass all 18+ ADR-007 security tests in `apps/daemon/src/api/auth/__tests__/security.test.ts`.
- Zero disruption to existing Astryx chat components or Bun/Effect daemon services.
- Adhere to the ADR-007 local pairing model.

---

## 4. Approaches

### Approach A: Multi-Layer CSRF & Proxy Origin Resolution (Chosen)
- **Mechanism:**
  1. **Effective Origin Fallback:** In `router.ts`, extract origin from `req.headers.origin`. If absent, extract origin from `req.headers.referer`. If still absent and `Sec-Fetch-Site === "same-origin"`, use `http://${req.headers.host}`. Validate the resulting origin using `fencing.isOriginValid(effectiveOrigin)`.
  2. **Loopback Dev Exemption for `Sec-Fetch-Site`:** In `fencing.ts`, allow `Sec-Fetch-Site: cross-site` if `devOriginAllowed` is true and the origin is verified loopback.
  3. **Vite Proxy Forwarding:** In `vite.config.ts`, configure `proxy.on('proxyReq')` to inject `origin` from the client request.
  4. **Watch Mode:** Update `apps/daemon/package.json` to `tsx watch src/index.ts`.
- **Pros:** Comprehensive, resilient against all browser quirks, preserves full defense-in-depth security.
- **Cons:** Touches 4 files (`router.ts`, `fencing.ts`, `vite.config.ts`, `package.json`).

### Approach B: Exclude `/api/providers/*` from Origin Fencing (Rejected)
- **Mechanism:** Exempt the provider endpoints from the state-changing origin check.
- **Why Rejected:** Violates ADR-007 CSRF protection principles and leaves other POST/PUT/DELETE endpoints vulnerable to the exact same failure when accessed across loopback variations.

---

## 5. Detailed Design Specifications

### 5.1 Daemon Effective Origin Resolution ([`apps/daemon/src/api/router.ts`](file:///C:/Users/bharg/OneDrive/Desktop/kantha-agent/apps/daemon/src/api/router.ts))
Replace naive `const origin = req.headers.origin;` with:
```typescript
const resolveEffectiveOrigin = (req: http.IncomingMessage): string | undefined => {
  if (typeof req.headers.origin === "string" && req.headers.origin.trim()) {
    return req.headers.origin.trim();
  }
  if (typeof req.headers.referer === "string" && req.headers.referer.trim()) {
    try {
      const parsed = new URL(req.headers.referer);
      return parsed.origin;
    } catch {}
  }
  const secFetchSite = req.headers["sec-fetch-site"];
  if ((secFetchSite === "same-origin" || secFetchSite === "none") && req.headers.host) {
    return `http://${req.headers.host}`;
  }
  return undefined;
};
```
Use `const origin = resolveEffectiveOrigin(req);` for CORS header setting and state-changing request fencing.

### 5.2 Sec-Fetch-Site Loopback Relaxation ([`apps/daemon/src/api/auth/fencing.ts`](file:///C:/Users/bharg/OneDrive/Desktop/kantha-agent/apps/daemon/src/api/auth/fencing.ts))
Update `isFetchSiteValid`:
```typescript
isFetchSiteValid(secFetchSite: string | undefined, origin?: string): boolean {
  if (!secFetchSite) {
    return true;
  }
  const normalized = secFetchSite.trim().toLowerCase();
  if (normalized === "same-origin" || normalized === "same-site" || normalized === "none") {
    return true;
  }
  if (this.devOriginAllowed && origin && this.isOriginValid(origin)) {
    return true;
  }
  return false;
}
```

### 5.3 Vite Dev Proxy Origin Forwarding ([`apps/web/vite.config.ts`](file:///C:/Users/bharg/OneDrive/Desktop/kantha-agent/apps/web/vite.config.ts))
In `server.proxy["/api"]`:
```typescript
proxy: {
  "/api": {
    target: DAEMON_TARGET,
    changeOrigin: true,
    secure: false,
    configure: (proxy) => {
      proxy.on("proxyReq", (proxyReq, req) => {
        const clientOrigin = req.headers.origin || (req.headers.host ? `http://${req.headers.host}` : undefined);
        if (clientOrigin && !proxyReq.getHeader("origin")) {
          proxyReq.setHeader("origin", clientOrigin);
        }
      });
    },
  },
}
```

### 5.4 Daemon Watch Mode ([`apps/daemon/package.json`](file:///C:/Users/bharg/OneDrive/Desktop/kantha-agent/apps/daemon/package.json))
Update:
```json
"scripts": {
  "dev": "tsx watch src/index.ts",
  ...
}
```

---

## 6. What's Left to the Builder
1. Implement the changes in `router.ts`, `fencing.ts`, `vite.config.ts`, and `package.json`.
2. Add regression tests in `apps/daemon/src/api/auth/__tests__/security.test.ts` verifying:
   - State-changing `POST` with missing `Origin` but valid `Referer` succeeds.
   - State-changing `POST` with missing `Origin` and `Sec-Fetch-Site: same-origin` succeeds.
   - State-changing `POST` with `Sec-Fetch-Site: cross-site` between loopback hosts in dev mode succeeds.
   - External origins (e.g. `https://attacker.com`) remain blocked with 403.
3. Verify test suite, typechecks, and web build.
4. Commit and push changes.
