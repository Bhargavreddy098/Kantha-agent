# ADR-007: Automatic Local Session Authentication and Strict Ingress Fencing

**Status:** ACCEPTED  
**Date:** 2026-11-21  
**Deciders:** Principal Software Architect, Security Lead  
**Technical Area:** Ingress Security, Browser Authentication, Session Lifecycle, Gateway API  
**Supersedes / Amends:** Supersedes naive "Loopback Trust" model described in legacy notes and prototypes  

---

## Context

Kantha is a local-first autonomous AI coding workbench comprising a Bun v1.4+ daemon (`apps/daemon`), a Vite + React 19 web workbench (`apps/web`), and an Ink terminal CLI (`apps/cli`). Early prototypes implemented a naive "Loopback Trust" model where:
1. The daemon bound to `127.0.0.1` and treated all requests arriving on loopback as trusted operator commands.
2. Permissive wildcard CORS (`Access-Control-Allow-Origin: *`) was set on HTTP responses.
3. `/api/auth/handshake` issued session tokens blindly to any GET request.
4. WebSocket PTY bridges (`/ws/pty/:id`) accepted connections without validating identity or session credentials.

A comprehensive security review identified critical vulnerabilities with naive loopback trust:
- **Cross-Origin & Drive-By Attacks:** Any malicious website visited by the developer in a browser tab can initiate cross-origin HTTP requests or WebSocket handshakes to `http://127.0.0.1:4000`. With open loopback trust, an untrusted web page could read repository code, trigger agent executions, or spawn shell commands.
- **DNS Rebinding:** An attacker-controlled domain (e.g. `rebind.evil.com`) configured with a near-zero TTL can resolve initially to an external server and subsequent requests to `127.0.0.1`. If the daemon fails to validate the HTTP `Host` header, browser same-origin policies fail, allowing external scripts full access to the loopback API.
- **WebSocket Hijacking:** Browser WebSocket connections do not adhere to CORS; any webpage can initiate `new WebSocket("ws://127.0.0.1:4000/ws/pty/...")`. Unauthenticated PTY endpoints yield remote code execution on the developer's workstation.
- **URL Secret Leakage:** Passing persistent access tokens in URL query strings exposes credentials to browser history, server access logs, and HTTP `Referer` headers.
- **Multi-Tenant Host Security:** Storing secrets with default file permissions on shared developer workstations allows other local OS users to extract daemon credentials.

The core requirement: **Zero manual login prompts and zero manual token copy-pasting during local development must NOT mean zero authentication.**

---

## Decision

Adopt **Automatic Local Session Authentication** with strict fail-closed Host and Origin fencing across all daemon ingress channels:

### 1. In-Memory Session Authority & Lifecycle
- The daemon generates fresh cryptographic session signing material in-memory upon process startup.
- Active session records are maintained in daemon memory. Restarting the daemon immediately invalidates all prior sessions.
- Daemon credentials are not written to persistent disk files for convenience. If cross-process coordination requires a local token file, it must be created with exclusive atomic permissions from creation (`mode: 0o600` on POSIX, restricted user-only ACL via `icacls` on Windows).

### 2. Ephemeral Pairing Ticket with Fragment Delivery
- When the CLI launches the web workbench, it generates a cryptographically random, high-entropy **Pairing Ticket** with a strict **60-second TTL**.
- The CLI launches the local browser with the ticket delivered exclusively in the URL fragment:
  ```
  http://127.0.0.1:4000/#ticket=<random-ticket>
  ```
- **Fragment Privacy:** URL fragments (`#...`) are processed purely on the client side and are never transmitted in HTTP request headers or `Referer` headers.
- **Single-Use & Invalidation:** The SPA immediately extracts the ticket, clears it from the address bar and browser history via `history.replaceState({}, '', '/')`, and exchanges it via `POST /api/auth/pair`.
- The daemon atomically consumes the ticket; invalid, expired, or replayed tickets are rejected with `401 Unauthorized`.
- The CLI displays a fallback URL in the console for headless or SSH port-forwarded sessions. A dedicated command (`kantha open` or interactive CLI key) allows regenerating an expired ticket without restarting the daemon.

### 3. Cookie-Based Session Transport (`kantha_session`)
- Upon successful ticket exchange, the daemon issues an `HttpOnly`, `SameSite=Strict`, host-only session cookie named `kantha_session`.
- The cookie uses the `Secure` attribute when operating in supported secure contexts (e.g. HTTPS or secure loopback contexts).
- All subsequent REST, SSE, and WebSocket requests require this session cookie.
- **WebSocket Handshake Validation:** Before completing any WebSocket upgrade on `/ws/pty/:id` or event channels, the daemon parses `req.headers.cookie`, validates `kantha_session` against in-memory active sessions, and aborts unauthenticated requests with `HTTP 401` before the connection is established.

### 4. Fail-Closed Host & Origin Fencing
- **Host Validation:** Every incoming HTTP request and WebSocket upgrade must validate that `Host` strictly matches the daemon's configured loopback address and port (e.g. `127.0.0.1:4000` or `localhost:4000`). Unknown, malformed, or DNS-rebound hostnames are rejected with `403 Forbidden` before routing.
- **Origin Validation:** Every state-changing browser request (`POST`, `PUT`, `DELETE`), pairing exchange, and WebSocket upgrade must validate the `Origin` header. External or `null` origins on sensitive browser endpoints are rejected.
- **CORS Elimination:** Wildcard CORS (`Access-Control-Allow-Origin: *`) is completely removed. In production, the daemon serves the compiled SPA assets from the identical origin (no CORS). In development mode, only explicitly configured local dev origins (e.g. `http://localhost:5173`) are permitted with credentials.
- **Defense in Depth:** `Sec-Fetch-Site` is verified where supported by modern browsers to ensure requests originate from the same site.

---

## Threat Model & Security Invariants

| Attack Vector | Defense Mechanism | Invariant |
|---|---|---|
| **DNS Rebinding** | Fail-closed `Host` header validation | Rebound hostnames (e.g. `evil.com`) rejected with 403 before request dispatch. |
| **Cross-Origin Drive-By (CSRF)** | `SameSite=Strict` cookie + `Origin` check | External web pages cannot attach cookies or forge state-changing requests. |
| **WebSocket Hijacking** | Cookie verification on HTTP Upgrade + Origin validation | No unauthenticated or cross-origin connection can open a PTY or stream. |
| **Credential In-Flight Leakage** | URL fragment (`#ticket=...`) + `history.replaceState()` | Ticket never sent to network wire, Referer headers, or preserved in browser history. |
| **Credential Replay** | Atomic single-use ticket consumption + 60s TTL | Intercepted or expired tickets cannot establish an active session. |
| **Multi-Tenant Host Snooping** | In-memory secrets (or `0600` / user ACL files) | Non-root local OS users cannot read daemon secrets. |
| **Stale Session Takeover** | In-memory session store invalidated on daemon restart | Terminating the daemon purges all active session keys. |

---

## Consequences

### Positive
- **Zero Developer Friction:** Retains 100% automated onboarding—no manual passwords, copy-pasting API tokens, or workspace selection modals.
- **Hardened Ingress Security:** Provides defense-in-depth against DNS rebinding, cross-origin drive-by attacks, and WebSocket PTY hijacking.
- **Token Privacy:** Sensitive tokens are kept out of `localStorage`, query parameters, and browser histories.
- **Architectural Symmetry:** A unified `kantha_session` cookie secures HTTP REST, SSE event streaming, and WebSocket terminal sessions identically.

### Negative / Trade-offs
- **SSH / Remote Development:** Headless environments require developers to copy the terminal fallback link or set up local port forwarding for the loopback address.
- **Development Tooling Setup:** Cross-port operation during local Vite development requires explicit dev origin configuration or a dev proxy.

---

## Verified Implementation & Automated Security Matrix

The architecture has been implemented across `@kantha/daemon` and `@kantha/web` and verified via an automated test suite ([apps/daemon/src/api/auth/__tests__/security.test.ts](file:///C:/Users/bharg/OneDrive/Desktop/kantha-agent/apps/daemon/src/api/auth/__tests__/security.test.ts)):

| # | Security Verification | Verified Outcome | Test Status |
|---|---|---|---|
| **1** | **Unauthenticated REST, SSE, and WebSocket** | REST endpoints (`/api/workspace`, `/api/providers`, `/api/sessions/prompt`) and SSE streams reject unauthenticated callers with HTTP 401. | **PASS** |
| **2** | **Malicious Origin, Invalid Host, DNS Rebinding** | Mismatched Host headers (e.g. `evil-rebinding.attacker.com`) and cross-origin POST/WebSocket requests fail-closed with HTTP 403 Forbidden. | **PASS** |
| **3** | **Expired, Malformed, and Reused Pairing Tickets** | Malformed tickets, tickets exceeding 60s TTL, and already-consumed tickets are rejected with HTTP 401. | **PASS** |
| **4** | **Concurrent Pairing Race Conditions** | 5 simultaneous requests presenting the identical ticket: exactly one succeeds with HTTP 200, all others fail with HTTP 401 (delete-on-read). | **PASS** |
| **5** | **JavaScript Inaccessibility to Session Cookie** | Issued `kantha_session_<port>` cookie enforces `HttpOnly`, `SameSite=Strict`, and host-only scope. | **PASS** |
| **6** | **Daemon Restart Invalidation** | Restarting the daemon purges the in-memory session store; previously issued cookies are rejected with HTTP 401. | **PASS** |
| **7 & 8** | **Normal CLI-to-Browser Launch & Workspace Discovery** | Initial pairing ticket exchanges for session cookie; `/api/workspace` automatically returns bound directory metadata without manual configuration. | **PASS** |
| **9** | **SSH / Headless Pairing via Fragment** | Ticket regenerated via CLI credential and delivered via `/#ticket=...` URL fragment; parsed and purged by SPA without history leakage. | **PASS** |
| **10** | **Non-Browser Origin Spoofing Rejection** | Requests spoofing localhost `Origin` without credentials are rejected with HTTP 401; trusted CLI requests authenticate via timing-safe `X-Kantha-CLI-Token`. | **PASS** |
| **11** | **Unauthenticated WebSocket PTY Pre-Upgrade Rejection** | Unauthenticated `/ws/pty/:id` upgrade requests are rejected with raw HTTP 401 before completing WebSocket framing or spawning a PTY. | **PASS** |
| **Reg. 1** | **Active WebSocket Termination on Session Invalidation** | Invalidating an active session in the daemon forcefully closes open WebSocket PTY connections with code 4001. | **PASS** |
| **Reg. 2** | **Timing-Safe CLI Token Verification** | CLI token verification uses `crypto.timingSafeEqual` and strictly rejects length mismatches. | **PASS** |
| **Reg. 3** | **Development Proxy Origin Handling** | `http://127.0.0.1:5173` is permitted only when dev mode is explicitly configured. | **PASS** |
| **Reg. 4** | **Multi-Daemon Cookie Isolation** | Session cookies are port-scoped (`kantha_session_<port>`), preventing cookie collision between concurrent workspace daemons. | **PASS** |

