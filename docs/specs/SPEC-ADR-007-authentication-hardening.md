# Specification: Automatic Local Session Authentication & Ingress Hardening (ADR-007)

## Problem Statement

When developers launch an autonomous local AI coding assistant, traditional authentication designs present a frustrating dilemma:
1. *Frictional Setup:* Requiring developers to generate, copy-paste API tokens, or complete manual login forms every time they open a local workspace introduces friction and breaks developer flow.
2. *Insecure Ambient Loopback Trust:* In an attempt to eliminate login screens, naive local implementations bind to loopback (`127.0.0.1`) and treat all incoming HTTP and WebSocket traffic as authorized. However, any malicious external website visited in the developer's web browser can initiate background requests or WebSocket connections to localhost. Without authentication and strict Origin fencing, untrusted web pages can exploit DNS rebinding to execute arbitrary shell commands, hijack terminal PTY sessions, or steal proprietary source code from the local filesystem.

Developers require a zero-friction local workflow where running the CLI immediately opens the workspace in their browser without manual logins, while guaranteeing that malicious websites running in their browser cannot interact with or compromise the local daemon.

---

## Solution

Kantha implements **Automatic Local Session Authentication**:
- The CLI launches the local daemon bound strictly to `127.0.0.1` and captures the workspace directory.
- The daemon generates fresh, ephemeral in-memory session authority and an initial high-entropy, single-use Pairing Ticket (60s TTL).
- The CLI launches the default browser using a URL containing the ticket exclusively in the URL fragment (`http://127.0.0.1:4000/#ticket=...`). Because URL fragments are never sent over the network wire or HTTP headers, credentials do not leak to server access logs or Referer headers.
- The browser Single Page Application (SPA) immediately extracts the ticket and clears the fragment from the address bar and browser history via history state replacement.
- The SPA exchanges the ticket over loopback via `POST /api/auth/pair`. The daemon consumes the ticket atomically (delete-on-read) and issues a secure, server-side session represented by an `HttpOnly`, `SameSite=Strict` cookie (`kantha_session_<port>`).
- Strict Host header validation defeats DNS rebinding, Origin fencing rejects cross-site browser requests, and pre-upgrade WebSocket authentication ensures that unauthenticated callers cannot establish PTY terminal handles.
- Direct non-browser CLI commands (such as reconnecting with `kantha open`) authenticate via a protected local credential file stored with restrictive operating-system permissions.

---

## User Stories

1. As a software developer, I want to type `kantha` in my repository terminal, so that my local coding workspace opens in my browser automatically without prompting me for a password or token.
2. As a software developer, I want the browser address bar to remain clean of authentication secrets, so that sensitive pairing credentials do not leak into my browser history or over-the-shoulder views.
3. As a developer navigating external websites while Kantha is running, I want cross-origin browser requests to be blocked by the daemon, so that malicious websites cannot read my workspace files or execute commands.
4. As a developer working on an untrusted Wi-Fi network, I want the daemon to validate the HTTP Host header against loopback, so that DNS-rebinding attacks cannot bypass the same-origin policy.
5. As a terminal user, I want unauthenticated WebSocket connections to be rejected before establishing a PTY session, so that external scripts cannot spawn unauthorized shell processes.
6. As a developer running multiple workspaces simultaneously on different local ports, I want session cookies to be port-scoped, so that concurrent daemon sessions do not overwrite each other.
7. As a developer using a remote SSH session with port forwarding, I want a clickable pairing URL printed in my terminal output, so that I can authenticate headless environments without an automated browser launch.
8. As a developer whose pairing link expired after 60 seconds, I want to type `kantha open` in my terminal, so that a fresh pairing ticket is regenerated without having to restart the daemon.
9. As a developer drafting a prompt when the daemon process restarts, I want the web workbench to display an unobtrusive reconnection overlay, so that my uncommitted text draft is preserved and not cleared.
10. As a multi-user workstation operator, I want the daemon's local CLI credential file to have restrictive file permissions (0600 on POSIX, user-only ACL on Windows), so that other local user accounts cannot read my daemon token.
11. As a developer whose session expires, I want active WebSocket terminal sessions to terminate immediately, so that revoked sessions do not leave persistent command channels open.
12. As a frontend engineer developing the workbench UI via Vite on port 5173, I want development proxying to forward API and WebSocket calls with original Origin headers preserved, so that the local daemon can enforce security boundaries consistently in development.
13. As a platform administrator, I want unauthenticated REST and Server-Sent Event (SSE) streams to reject callers with HTTP 401, so that unauthorized scripts cannot monitor ongoing agent runs.
14. As a developer double-clicking a pairing link, I want concurrent requests using the same ticket to allow exactly one consumer, so that race conditions cannot lead to credential replay.

---

## Implementation Decisions

### 1. Ingress Fencing & Host/Origin Middleware
- The daemon binds strictly to loopback (`127.0.0.1`).
- Every incoming HTTP request and WebSocket handshake validates that the `Host` header strictly matches the configured loopback endpoint (`127.0.0.1:<port>` or `localhost:<port>`). Unknown or rebound hostnames fail-closed with HTTP 403 Forbidden.
- Permissive CORS (`Access-Control-Allow-Origin: *`) is prohibited.
- For all state-changing requests (`POST`, `PUT`, `DELETE`), pairing handshakes, and WebSocket upgrades, the `Origin` header is validated against authorized origins. Requests missing an Origin header from browser contexts fail-closed with HTTP 403 Forbidden.
- Requests with `Sec-Fetch-Site: cross-site` are rejected with HTTP 403 Forbidden.

### 2. In-Memory Session Authority & Ephemeral Lifecycle
- Session authority is generated in-memory upon daemon startup and held in an in-memory session registry.
- Terminating or restarting the daemon immediately purges all active session keys, invalidating previous cookies.
- No session secrets are persisted to disk for convenience.

### 3. Pairing Ticket Registry with Delete-on-Read Semantics
- Pairing tickets are 256-bit cryptographically random strings with a 60-second TTL.
- Consumption uses synchronous delete-on-read lookups before asynchronous execution:
  ```typescript
  type TicketRegistry = {
    consumeTicket: (ticketId: string) => boolean;
  };
  ```
  If a ticket exists and is unexpired, it is deleted from the registry in the same tick and returns true; subsequent or concurrent attempts return false.
- A background garbage-collection sweep prunes expired tickets every 30 seconds.

### 4. Fragment Delivery & SPA History State Purge
- Launch URLs format the ticket exclusively in the fragment: `http://127.0.0.1:<port>/#ticket=<token>`.
- The browser Single Page Application reads the fragment on initial mount, extracts the ticket, and immediately invokes history state replacement to clear the fragment before making the pairing network call.
- The ticket is submitted via `POST /api/auth/pair`.

### 5. Cookie-Based Browser Session Transport
- Upon successful pairing, the daemon issues a host-only session cookie named `kantha_session_<port>` with `HttpOnly` and `SameSite=Strict`.
- The `Secure` attribute is appended conditionally when operating behind HTTPS or secure contexts.
- All REST, SSE, and WebSocket upgrade requests are authenticated using this cookie.

### 6. Pre-Upgrade WebSocket Validation & Session Binding
- During the HTTP Upgrade handshake for `/ws/pty/:sessionId`, the server validates Host, Origin, and the `kantha_session_<port>` cookie.
- If validation fails, the connection is aborted with raw `HTTP/1.1 401 Unauthorized` or `403 Forbidden` and the socket is destroyed before completing the WebSocket framing handshake or allocating a PTY.
- Active WebSockets are registered against the session record. Invalidating or expiring the session forcefully closes open WebSockets with close code 4001.

### 7. Protected CLI Credential Transport
- For independent CLI processes (e.g. `kantha open`), the daemon writes a 256-bit CLI token to `~/.kantha/daemon_<port>.token`.
- File creation uses exclusive mode (`wx`) with restrictive permissions (`0600` on POSIX, user-restricted ACL via `icacls` on Windows).
- Symlink attacks are defended against by unlinking any existing symlink before creation.
- Invocations present the `X-Kantha-CLI-Token` header, verified via constant-time comparison (`crypto.timingSafeEqual`).

### 8. Hardened Development Proxy
- The Vite development server binds to `127.0.0.1:5173`.
- Proxying for `/api` rewrites the upstream Host header to match the daemon loopback target.
- Proxying for `/ws` preserves the browser's original WebSocket Origin without rewriting (`rewriteWsOrigin: false`), ensuring daemon origin checks remain effective.
- Development origin allowances in the daemon are explicitly gated to development mode.

---

## Testing Decisions

### What Makes a Good Test
- Tests verify external system behavior through public HTTP and WebSocket boundaries, not private internal methods.
- Assertions verify against independent expected values rather than tautological re-computations.
- Test suites must be executable without manual human intervention.

### Modules Under Test
- Ingress Fencing (`isHostValid`, `isOriginValid`, `isFetchSiteValid`)
- Pairing Ticket Registry (atomic consumption, TTL expiration, capacity limits)
- Session Store (creation, expiry, WebSocket tracking and termination)
- CLI Credential Manager (timing-safe equality, permission initialization, symlink protection)
- Daemon Server Integration (REST, SSE, WebSocket pre-upgrade rejection, multi-daemon isolation)

### Prior Art
- OpenCode V2 local session pairing architecture
- OWASP WebSocket Security & Cross-Site WebSocket Hijacking guidelines
- RFC 6265 HTTP State Management Mechanism

---

## Out of Scope

- Remote cloud multi-tenant identity providers (e.g. OAuth, SAML, Supabase Auth).
- Long-term persistent authentication cookies surviving daemon process death.
- Multi-user authentication within a single running daemon instance.
- Packaging into the Tauri v2 desktop shell (deferred to subsequent milestone).

---

## Further Notes

- Browser cookies ignore TCP ports per RFC 6265. The `kantha_session_<port>` cookie naming convention provides logical session namespace isolation across multiple simultaneous local workspaces running on different loopback ports.
- The daemon serves static SPA assets from `apps/web/dist` when packaged for production, eliminating CORS entirely.
