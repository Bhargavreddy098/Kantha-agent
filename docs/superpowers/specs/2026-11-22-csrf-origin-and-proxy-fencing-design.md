# Revised Design: Secure CSRF Source-Origin Validation & Dev Proxy Compatibility

**Date:** 2026-11-22  
**Status:** Pending User Approval  
**Scope:** `apps/daemon`, `apps/web`  

---

## 1. Intent and Root Cause Analysis

### 1.1 The Issue
When testing connection or discovering models in the Kantha Settings modal, requests to `POST http://127.0.0.1:3000/api/providers/discover` and `POST http://127.0.0.1:3000/api/providers/test` fail with `403 Forbidden` (`Forbidden: Unauthorized Origin` or `Forbidden: Unauthorized or missing Origin`).

### 1.2 Inspection of Request & Validation Mechanics
1. **Frontend Request Path:** The browser SPA runs on Vite (defaulting to port 3000 at `http://127.0.0.1:3000` or `http://localhost:3000`). Requests to `/api/*` are reverse-proxied by Vite to the Bun/Node daemon at `http://127.0.0.1:4000`.
2. **Origin & Referer Headers:**
   - On `POST` fetch requests, browsers send `Origin: http://127.0.0.1:3000` (or `http://localhost:3000`) along with `Referer: http://127.0.0.1:3000/`.
   - In some browser/proxy configurations, `Origin` may be absent while `Referer` is present.
3. **Daemon Origin Fencing (`IngressFencing`):**
   - The daemon maintains `allowedOrigins` and `allowedHosts`.
   - In `apps/daemon/src/index.ts`, `devOriginAllowed: true` was not consistently propagated, causing `allowedOrigins` to contain only the daemon's own port (e.g. `http://127.0.0.1:4000`), immediately rejecting Vite frontend requests from port 3000 with `403 Forbidden: Unauthorized Origin`.
   - In `apps/daemon/src/api/router.ts` line 377, `if (!origin || !fencing.isOriginValid(origin))` unconditionally rejected state-changing requests if `req.headers.origin` was absent, ignoring a valid `Referer`.
4. **Daemon Watch Mode:** `apps/daemon/package.json` ran `tsx src/index.ts` without `--watch`, meaning in-memory daemons did not reload when fixes were saved.

---

## 2. Security Principles & Non-Negotiable Requirements

Per user requirements, we **do not implement broad security exemptions or blanket loopback trust**:
1. **Explicit Exact-Origin Allowlist Only:** No wildcard loopback checks (e.g. `isLoopback` accepting any arbitrary port on `127.0.0.1`). Only configured origins (`http://127.0.0.1:3000`, `http://localhost:3000`, `http://127.0.0.1:5173`, `http://localhost:5173`, daemon port, and `KANTHA_ALLOWED_ORIGINS`) are permitted.
2. **Secure Source-Origin Resolution:** Prefer `req.headers.origin`. If absent, securely parse `new URL(req.headers.referer).origin`. Validate against the explicit allowlist.
3. **No Unvalidated Origin Synthesis:** Never use `Host` or `Sec-Fetch-Site: none` to establish or invent a trusted origin. Never synthesize `Origin` in Vite from unvalidated client Host headers.
4. **Strict Cross-Site Blocking:** Reject `Sec-Fetch-Site: cross-site` on state-changing requests by default. Untrusted cross-site pages cannot trigger state mutations.
5. **Separate CORS from CSRF:** Only reflect an actual, valid `req.headers.origin` in `Access-Control-Allow-Origin`. Never reflect Referer into CORS headers.
6. **Preserve Authentication:** Maintain ADR-007 session cookie verification, CLI timing-safe token verification, and fail-closed behavior.

---

## 3. Concrete Implementation Plan

### 3.1 Strict Ingress Fencing ([`apps/daemon/src/api/auth/fencing.ts`](file:///C:/Users/bharg/OneDrive/Desktop/kantha-agent/apps/daemon/src/api/auth/fencing.ts))
- Revert broad loopback matching.
- Populate `allowedOrigins` and `allowedHosts` with:
  - Daemon port: `127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`
  - When `devOriginAllowed: true`: Configured frontend dev ports `[3000, 3001, 3002, 5173, 5174, 5175, 4173]` for both `127.0.0.1` and `localhost`.
  - Any explicit origins from options or `process.env.KANTHA_ALLOWED_ORIGINS`.
- `isHostValid(host)`: Strict exact match in `this.allowedHosts`.
- `isOriginValid(origin)`: Strict exact match in `this.allowedOrigins`.
- `isFetchSiteValid(secFetchSite)`: Permits `same-origin`, `same-site`, `none`, or undefined. Rejects `cross-site`.

### 3.2 Secure Source-Origin & CORS Separation ([`apps/daemon/src/api/router.ts`](file:///C:/Users/bharg/OneDrive/Desktop/kantha-agent/apps/daemon/src/api/router.ts))
1. **CORS Handling (Lines 184-197):**
   ```typescript
   const reqOrigin = req.headers.origin;
   if (typeof reqOrigin === "string") {
     if (fencing.isOriginValid(reqOrigin)) {
       res.setHeader("Access-Control-Allow-Origin", reqOrigin);
       res.setHeader("Access-Control-Allow-Credentials", "true");
       res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
       res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Kantha-CLI-Token");
     } else {
       res.writeHead(403, { "Content-Type": "application/json" });
       res.end(JSON.stringify({ error: "Forbidden: Unauthorized Origin" }));
       return;
     }
   }
   ```
2. **CSRF State-Changing Verification (Line 373):**
   ```typescript
   if ((req.method === "POST" || req.method === "PUT" || req.method === "DELETE") && !isCli) {
     let sourceOrigin: string | undefined;
     if (typeof req.headers.origin === "string" && req.headers.origin.trim()) {
       sourceOrigin = req.headers.origin.trim();
     } else if (typeof req.headers.referer === "string" && req.headers.referer.trim()) {
       try {
         sourceOrigin = new URL(req.headers.referer).origin;
       } catch {}
     }

     if (!sourceOrigin || !fencing.isOriginValid(sourceOrigin)) {
       res.writeHead(403, { "Content-Type": "application/json" });
       res.end(JSON.stringify({ error: "Forbidden: Unauthorized or missing Origin" }));
       return;
     }

     // Origin & Referer mismatch defense: if both are sent, both must be valid
     if (req.headers.origin && req.headers.referer) {
       try {
         const refOrigin = new URL(req.headers.referer).origin;
         if (!fencing.isOriginValid(refOrigin)) {
           res.writeHead(403, { "Content-Type": "application/json" });
           res.end(JSON.stringify({ error: "Forbidden: Invalid Referer origin" }));
           return;
         }
       } catch {
         res.writeHead(403, { "Content-Type": "application/json" });
         res.end(JSON.stringify({ error: "Forbidden: Malformed Referer header" }));
         return;
       }
     }
   }
   ```

### 3.3 Daemon Watch Mode ([`apps/daemon/package.json`](file:///C:/Users/bharg/OneDrive/Desktop/kantha-agent/apps/daemon/package.json))
Change script to:
```json
"dev": "tsx watch src/index.ts"
```

### 3.4 Verification of Provider Logic & Upstream Error Handling
- `/api/providers/test`: Calls `providerRegistry.testConnection(payload)`. Returns `{ success, latencyMs, status, error }` with HTTP 200 (or 500 on unexpected exception).
- `/api/providers/discover`: Calls `providerRegistry.discoverModels(payload)`. Returns `{ models: [...] }` with HTTP 200 (or `{ models: [], error }` on upstream error).

---

## 4. Comprehensive Regression Test Matrix

Add to [`apps/daemon/src/api/auth/__tests__/security.test.ts`](file:///C:/Users/bharg/OneDrive/Desktop/kantha-agent/apps/daemon/src/api/auth/__tests__/security.test.ts):
1. **Valid Origin on Configured Frontend Ports:** `POST /api/providers/discover` and `/api/providers/test` with `Origin: http://127.0.0.1:3000` and `http://localhost:3000` $\rightarrow$ `200 OK`.
2. **Valid Referer Fallback:** `POST /api/providers/discover` with no `Origin` but `Referer: http://127.0.0.1:3000/settings` $\rightarrow$ `200 OK`.
3. **Missing Both Origin & Referer on State-Changing Request:** `POST /api/providers/discover` with neither header $\rightarrow$ `403 Forbidden`.
4. **Origin `null`:** `Origin: null` or `"null"` string $\rightarrow$ `403 Forbidden`.
5. **Mismatched Hostile Referer:** Valid `Origin: http://127.0.0.1:3000` with hostile `Referer: https://attacker.com/page` $\rightarrow$ `403 Forbidden`.
6. **Hostile Host Header:** Request with `Host: evil.attacker.com` $\rightarrow$ `403 Forbidden`.
7. **Cross-Site Request:** Request with `Sec-Fetch-Site: cross-site` $\rightarrow$ `403 Forbidden`.
8. **Both Localhost Variants:** Both `http://127.0.0.1:3000` and `http://localhost:3000` pass when configured.
9. **CORS Separation:** Valid Referer fallback does NOT set `Access-Control-Allow-Origin: undefined` or leak Referer.
10. **Provider Logic & Error Handling:** Successful provider execution verifies mock upstream endpoint behavior.

---

## 5. Verification Gate Before Commit

1. Run `npx tsx --test apps/daemon/src/api/auth/__tests__/security.test.ts` (all security tests pass).
2. Run `npx tsx --test apps/daemon/src/services/__tests__/providerRegistry.test.ts` and `apps/daemon/src/api/__tests__/chat.test.ts`.
3. Run `pnpm -r typecheck` and `pnpm --filter @kantha/web build`.
4. Verify Discover Models and Test Connection manually in the browser.
5. Zero commits or pushes until all verification steps pass cleanly.
