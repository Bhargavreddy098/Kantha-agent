# Secure CSRF Source-Origin Validation & Dev Proxy Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Securely fix `403 Forbidden` errors on `/api/providers/discover` and `/api/providers/test` by implementing strict source-origin resolution with exact allowlisting, CORS separation, and daemon watch mode without broad loopback exemptions.

**Architecture:** The daemon (`apps/daemon`) validates incoming HTTP requests using `IngressFencing`. For state-changing requests (`POST`, `PUT`, `DELETE`), it resolves the source-origin by preferring `req.headers.origin` and falling back to `req.headers.referer`, strictly checking it against an explicit exact allowlist (`localhost` and `127.0.0.1` on configured frontend dev ports `3000, 3001, 3002, 5173, 5174, 5175, 4173` and the daemon port). CORS header reflection is kept separate and only reflects actual, validated `Origin` headers. Daemon watch mode is enabled via `tsx watch`.

**Tech Stack:** TypeScript, Node.js HTTP/WebSocket, Bun, Vite dev server, Node test runner (`node:test`).

**Spec:** [`docs/superpowers/specs/2026-11-22-csrf-origin-and-proxy-fencing-design.md`](file:///C:/Users/bharg/OneDrive/Desktop/kantha-agent/docs/superpowers/specs/2026-11-22-csrf-origin-and-proxy-fencing-design.md)

---

## Global Constraints

- **Exact-Origin Allowlist Only:** No generic loopback wildcards (no `isLoopback` matching arbitrary ports). Only explicitly configured origins are permitted.
- **No Unvalidated Origin Synthesis:** Never use `Host` or `Sec-Fetch-Site: none` to establish trusted origin.
- **Strict Cross-Site Blocking:** Reject `Sec-Fetch-Site: cross-site` on state-changing requests by default.
- **CORS Separation:** Only reflect an actual validated `req.headers.origin` in `Access-Control-Allow-Origin`. Never reflect Referer.
- **Mismatch Defense:** If both `Origin` and `Referer` are present, both must match the allowlist.
- **Fail-Closed Gate:** Do not commit or push changes until all security tests, typechecks, builds, and manual UI verifications pass.

---

## Review Focus

1. **Missing Origin with Valid Referer:** State-changing `POST` from same-origin without `Origin` header must succeed via `Referer` fallback.
2. **Missing Both Origin & Referer:** State-changing `POST` without either header must fail closed with `403 Forbidden`.
3. **Mismatched Hostile Referer:** Valid `Origin: http://127.0.0.1:3000` paired with `Referer: https://evil.com/page` must be rejected with `403 Forbidden`.
4. **Origin `null`:** Request with `Origin: null` must be rejected with `403 Forbidden`.
5. **CORS Reflection Leakage:** A request authenticated via `Referer` fallback must NOT output `Access-Control-Allow-Origin: undefined` or leak the Referer into CORS headers.

---

## Tasks

### Task 1: Strict Exact-Origin Ingress Fencing

**Files:**
- Modify: `apps/daemon/src/api/auth/fencing.ts`
- Test: `apps/daemon/src/api/auth/__tests__/security.test.ts`

**Interfaces:**
- Produces: `IngressFencing` class with:
  - `isHostValid(hostHeader: string | undefined): boolean`
  - `isOriginValid(originHeader: string | undefined): boolean`
  - `isFetchSiteValid(secFetchSite: string | undefined): boolean`

- [ ] **Step 1: Write failing test verifying exact allowlist without loopback wildcards**

In `apps/daemon/src/api/auth/__tests__/security.test.ts`, add test proving an unconfigured random loopback port (e.g. `http://127.0.0.1:9999`) is rejected by `isOriginValid`:

```typescript
it("Security: Unconfigured loopback ports (e.g. 127.0.0.1:9999) are rejected (no wildcard loopback trust)", () => {
  const fencing = new IngressFencing({ port: 4000, devOriginAllowed: true });
  assert.strictEqual(fencing.isOriginValid("http://127.0.0.1:9999"), false);
  assert.strictEqual(fencing.isOriginValid("http://localhost:9999"), false);
  assert.strictEqual(fencing.isOriginValid("http://127.0.0.1:3000"), true);
  assert.strictEqual(fencing.isOriginValid("http://localhost:3000"), true);
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx tsx --test apps/daemon/src/api/auth/__tests__/security.test.ts`
Expected: FAIL because previously `fencing.ts` permitted any loopback port via `parsed.hostname === "127.0.0.1"`.

- [ ] **Step 3: Implement exact allowlist in `apps/daemon/src/api/auth/fencing.ts`**

Remove the generic loopback check in `isHostValid` and `isOriginValid`. Populate `this.allowedOrigins` and `this.allowedHosts` explicitly with the daemon port and, when `devOriginAllowed: true`, configured frontend ports `[3000, 3001, 3002, 5173, 5174, 5175, 4173]`.

```typescript
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
      ...(this.port === 80 ? ["127.0.0.1", "localhost", "[::1]"] : []),
    ]);

    this.allowedOrigins = new Set([
      `http://127.0.0.1:${this.port}`,
      `http://localhost:${this.port}`,
      `http://[::1]:${this.port}`,
    ]);

    if (options.allowedOrigins && Array.isArray(options.allowedOrigins)) {
      for (const origin of options.allowedOrigins) {
        if (origin) {
          const norm = origin.trim().toLowerCase();
          this.allowedOrigins.add(norm);
          try {
            const parsed = new URL(norm);
            this.allowedHosts.add(parsed.host);
          } catch {}
        }
      }
    }

    if (typeof process !== "undefined" && process.env?.KANTHA_ALLOWED_ORIGINS) {
      const envOrigins = process.env.KANTHA_ALLOWED_ORIGINS.split(",").map((s) => s.trim().toLowerCase());
      for (const o of envOrigins) {
        if (o) {
          this.allowedOrigins.add(o);
          try {
            const parsed = new URL(o);
            this.allowedHosts.add(parsed.host);
          } catch {}
        }
      }
    }

    if (this.devOriginAllowed) {
      const devPorts = [3000, 3001, 3002, 5173, 5174, 5175, 4173];
      for (const p of devPorts) {
        this.allowedHosts.add(`127.0.0.1:${p}`);
        this.allowedHosts.add(`localhost:${p}`);
        this.allowedOrigins.add(`http://127.0.0.1:${p}`);
        this.allowedOrigins.add(`http://localhost:${p}`);
      }
    }
  }

  isHostValid(hostHeader: string | undefined): boolean {
    if (!hostHeader || typeof hostHeader !== "string") return false;
    return this.allowedHosts.has(hostHeader.trim().toLowerCase());
  }

  isOriginValid(originHeader: string | undefined): boolean {
    if (!originHeader || typeof originHeader !== "string") return false;
    return this.allowedOrigins.has(originHeader.trim().toLowerCase());
  }

  isFetchSiteValid(secFetchSite: string | undefined): boolean {
    if (!secFetchSite) return true;
    const normalized = secFetchSite.trim().toLowerCase();
    return normalized === "same-origin" || normalized === "same-site" || normalized === "none";
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test apps/daemon/src/api/auth/__tests__/security.test.ts`
Expected: PASS

---

### Task 2: Secure Source-Origin Resolution & Strict CORS Separation

**Files:**
- Modify: `apps/daemon/src/api/router.ts:184-197, 373-383`
- Test: `apps/daemon/src/api/auth/__tests__/security.test.ts`

**Interfaces:**
- Consumes: `fencing.isOriginValid`, `sessionStore.validateSession`, `cliManager.verifyCliToken`
- Produces: Correct CORS response headers and state-changing CSRF verification

- [ ] **Step 1: Write failing tests for Referer fallback, Origin null, and Mismatched Referer**

In `apps/daemon/src/api/auth/__tests__/security.test.ts`, add test cases:

```typescript
it("Requirement: State-changing POST with missing Origin falls back to valid Referer", async () => {
  const ticket = daemon.ticketRegistry.createTicket();
  const pairRes = await makeRequest("/api/auth/pair", {
    method: "POST",
    headers: {
      Origin: "http://127.0.0.1:3000",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ticket }),
  });
  const cookieHeader = pairRes.headers["set-cookie"]![0].split(";")[0];

  // Request with NO Origin header, but valid Referer
  const res = await makeRequest("/api/providers/default", {
    method: "POST",
    headers: {
      Cookie: cookieHeader,
      Referer: "http://127.0.0.1:3000/settings",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ modelId: "openai:gpt-4o" }),
  });
  assert.strictEqual(res.status, 200, "Valid Referer fallback must succeed with 200");
  assert.strictEqual(
    res.headers["access-control-allow-origin"],
    undefined,
    "CORS header must NOT reflect Referer as Origin"
  );
});

it("Requirement: Origin null is rejected with 403", async () => {
  const ticket = daemon.ticketRegistry.createTicket();
  const pairRes = await makeRequest("/api/auth/pair", {
    method: "POST",
    headers: { Origin: "http://127.0.0.1:3000", "Content-Type": "application/json" },
    body: JSON.stringify({ ticket }),
  });
  const cookieHeader = pairRes.headers["set-cookie"]![0].split(";")[0];

  const res = await makeRequest("/api/providers/default", {
    method: "POST",
    headers: {
      Cookie: cookieHeader,
      Origin: "null",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ modelId: "openai:gpt-4o" }),
  });
  assert.strictEqual(res.status, 403, "Origin 'null' must return 403 Forbidden");
});

it("Requirement: Mismatched hostile Referer is rejected with 403", async () => {
  const ticket = daemon.ticketRegistry.createTicket();
  const pairRes = await makeRequest("/api/auth/pair", {
    method: "POST",
    headers: { Origin: "http://127.0.0.1:3000", "Content-Type": "application/json" },
    body: JSON.stringify({ ticket }),
  });
  const cookieHeader = pairRes.headers["set-cookie"]![0].split(";")[0];

  const res = await makeRequest("/api/providers/default", {
    method: "POST",
    headers: {
      Cookie: cookieHeader,
      Origin: "http://127.0.0.1:3000",
      Referer: "https://evil-attacker.com/exploit",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ modelId: "openai:gpt-4o" }),
  });
  assert.strictEqual(res.status, 403, "Hostile Referer alongside valid Origin must be rejected with 403");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --test apps/daemon/src/api/auth/__tests__/security.test.ts`
Expected: FAIL on Referer fallback or mismatch detection.

- [ ] **Step 3: Update `apps/daemon/src/api/router.ts`**

1. At lines 184-197: Only reflect actual, valid `req.headers.origin` in CORS headers.
2. At lines 373-383:
   - Prefer `req.headers.origin`.
   - Fall back to `req.headers.referer` (parse `new URL(referer).origin`).
   - Validate against `fencing.isOriginValid(sourceOrigin)`.
   - If both `req.headers.origin` and `req.headers.referer` are present, validate both against `fencing.isOriginValid`.
   - If invalid or missing both, reject with `403 Forbidden`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test apps/daemon/src/api/auth/__tests__/security.test.ts`
Expected: PASS

---

### Task 3: Daemon Watch Mode Configuration

**Files:**
- Modify: `apps/daemon/package.json:8`

- [ ] **Step 1: Update `"dev"` script in `apps/daemon/package.json`**

Change:
```json
"dev": "tsx watch src/index.ts"
```

- [ ] **Step 2: Verify `apps/daemon` script syntax**

Run: `pnpm --filter @kantha/daemon dev --help` (or check `package.json` validity).

---

### Task 4: Complete Security Regression Test Matrix & Upstream Provider Handling

**Files:**
- Test: `apps/daemon/src/api/auth/__tests__/security.test.ts`

**Interfaces:**
- Validates:
  1. Valid `Origin: http://127.0.0.1:3000` on `/api/providers/discover` and `/api/providers/test` $\rightarrow$ 200.
  2. Valid `Origin: http://localhost:3000` $\rightarrow$ 200.
  3. Missing both Origin and Referer $\rightarrow$ 403.
  4. Origin `null` $\rightarrow$ 403.
  5. Mismatched Referer $\rightarrow$ 403.
  6. Hostile Host header $\rightarrow$ 403.
  7. Cross-site request (`Sec-Fetch-Site: cross-site`) $\rightarrow$ 403.
  8. Provider test & discover response payload structure and error status handling.

- [ ] **Step 1: Implement all 10 test scenarios in `security.test.ts`**

Write test blocks verifying each scenario above with exact assertions on HTTP status, CORS headers, and response bodies.

- [ ] **Step 2: Run full security test suite**

Run: `npx tsx --test apps/daemon/src/api/auth/__tests__/security.test.ts`
Expected: All tests pass with 0 failures.

- [ ] **Step 3: Run full daemon unit test suite**

Run: `npx tsx --test apps/daemon/src/services/__tests__/providerRegistry.test.ts; npx tsx --test apps/daemon/src/api/__tests__/chat.test.ts`
Expected: 17/17 tests pass.

---

### Task 5: Full Verification Gate (Builds, Typechecks & Manual Browser UI)

**Files:**
- Verify: Full repository

- [ ] **Step 1: Run repo-wide typecheck**

Run: `pnpm -r typecheck`
Expected: Zero TypeScript errors.

- [ ] **Step 2: Run web build**

Run: `pnpm --filter @kantha/web build`
Expected: Clean production build.

- [ ] **Step 3: Manual Browser UI Verification**

1. Start development server: `pnpm dev`.
2. Open browser at `http://127.0.0.1:3000` (and `http://localhost:3000`).
3. Click Settings $\rightarrow$ Providers $\rightarrow$ Add Custom Provider.
4. Test "Test Connection" with an endpoint: verify latency and connection status.
5. Click "Discover Models": verify model list is populated without 403 errors.
6. Verify Network tab confirms HTTP 200 and absence of CSRF/Origin rejection.

- [ ] **Step 4: Review Git status and commit**

Only after all automated tests pass and manual verification succeeds:
```bash
git add apps/daemon/src/api/auth/fencing.ts apps/daemon/src/api/router.ts apps/daemon/package.json apps/daemon/src/api/auth/__tests__/security.test.ts
git commit -m "fix(auth): secure CSRF source-origin resolution, strict exact allowlist, and daemon watch mode"
```
