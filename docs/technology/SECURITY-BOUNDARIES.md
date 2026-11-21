# Technical Security Boundaries & Hardening Specification

**Status:** APPROVED FOR PLANNING — ADR-007 Verified  
**Version:** 2.0.0  
**Effective Date:** 2026-11-21  
**Document Level:** Level 2 — Technology Specification

---

## 1. Multi-Tier Security Threat Model

Kantha operates in an environment where untrusted code, external LLM outputs, browser contexts, and arbitrary repository contents intersect. To ensure safe, non-destructive execution, Kantha enforces five structured security boundaries:

```
[External Browser / Network / Client Ingress]
         │
         ▼  (Boundary 0: Ingress Authentication & Host/Origin Fencing [ADR-007])
[Gateway Ingress & WebSocket Handshake Layer]
         │
         ▼  (Boundary 1: Zero-Authority Context & Schema Enforcement)
[Harness Instruction & Tool Validation Layer]
         │
         ▼  (Boundary 2: Tri-State Action Policy & Human Gate)
[Tool Action Policy: Allow / Ask / Deny]
         │
         ▼  (Boundary 3: Workspace Containment & Process Isolation)
[Isolated Execution Environment / Sandbox]
         │
         ▼  (Boundary 4: Credential & Network Egress Protection)
[Gateway SecretStore & Egress Proxy] ──> Upstream Providers
```

---

## 2. The Five Security Boundaries

### Boundary 0: Ingress Authentication & Strict Host/Origin Fencing (ADR-007)
- **Invariant:** No unauthenticated request—whether via HTTP, SSE, or WebSocket—may execute commands, establish a PTY session, or access workspace resources. Binding to loopback (`127.0.0.1`) alone is NOT an authorization boundary.
- **Enforcement ([ADR-007](../decisions/ADR-007-automatic-local-session-authentication.md)):**
  - **Host Validation:** Every incoming HTTP request and WebSocket handshake validates the `Host` header against the explicitly configured loopback address and port (`127.0.0.1:<port>` / `localhost:<port>`). DNS-rebound hostnames and malformed hosts fail-closed with `403 Forbidden` before routing.
  - **Origin Fencing:** All state-changing browser requests (`POST`, `PUT`, `DELETE`), pairing handshakes, and WebSocket upgrades validate the `Origin` header. Cross-origin requests from external web pages are rejected. Permissive CORS (`Access-Control-Allow-Origin: *`) is strictly prohibited.
  - **Defense in Depth (`Sec-Fetch-Site`):** Requests explicitly flagged by modern browsers as `Sec-Fetch-Site: cross-site` are rejected with `403 Forbidden`.
  - **URL Fragment Delivery & Atomic Ingestion:**
    1. The launch URL fragment (`http://127.0.0.1:<port>/#ticket=<token>`) is processed purely within the client user-agent and is **never** transmitted in HTTP request or `Referer` headers during the initial browser navigation.
    2. The SPA immediately purges the fragment from the address bar and browser history via `history.replaceState({}, '', '/')`.
    3. The ticket is transmitted via an authenticated `POST /api/auth/pair` request over the loopback interface.
    4. The daemon atomically consumes the ticket using synchronous delete-on-read semantics, guaranteeing single-use protection against replay and race conditions.
  - **Credential Layer Separation:**
    1. *Session Secret*: Ephemeral cryptographic signing and session material generated in-memory upon daemon startup.
    2. *Active Browser Session*: Represented by an in-memory session record and an `HttpOnly`, `SameSite=Strict`, host-only cookie named `kantha_session_<port>` (with `Secure` attribute in HTTPS/secure contexts).
    3. *Protected CLI Credential*: A 256-bit token stored in `~/.kantha/daemon_<port>.token` with restrictive OS permissions (`0600` on POSIX, user-only ACL on Windows), used by independent local processes (e.g. `kantha open`) via `X-Kantha-CLI-Token`.
  - **Pre-Upgrade WebSocket Termination:** Validates credentials before accepting WebSocket upgrades on `/ws/pty/:id`. Invalidating a session forcefully terminates active WebSockets (close code `4001`).
  - *(Status: Fully implemented and verified in `apps/daemon` and `apps/web` with 16 automated security tests).*

### Boundary 1: Zero In-Context Authority & Schema Enforcement
- **Invariant:** Neither repository file contents, commit messages, agent prompt instructions (`AGENTS.md`), nor LLM completions carry architectural authority.
- **Enforcement:**
  - Instructions from `AGENTS.md` can recommend tool usage but can **never** grant permissions, elevate workspace privileges, or bypass budgets.
  - All model-generated tool calls must pass strict runtime validation (via Effect Schema / Zod) before dispatch. Unparseable or malformed payloads throw `HarnessError('invalid_tool_call')`.
  - *(Status: Implemented in Custom Effect Harness).*

### Boundary 2: Action Policy & Human Approval Gate
- **Invariant:** Mutating or high-impact actions cannot execute without authorized human consent or pre-approved policy grants.
- **Policy Classification:**
  - **Allow:** Read-only operations within granted workspace roots (`file_read`, `directory_list`, `ripgrep_search`). Executed immediately.
  - **Ask:** Mutating actions (`file_patch`, `file_create`, `terminal_exec`). The Harness suspends execution, enters `awaiting_approval`, and waits for user confirmation.
  - **Deny:** Forbidden actions (directory traversal outside root, reading `.env`, modifying git internals). Terminated immediately with `HarnessError('denied')`.
- **Cryptographic Digest Binding:**
  - Approval decisions bind `SHA256(actionId + runId + normalizedArgs)`.
  - Any alteration to tool arguments invalidates the approval token.
  - Approvals enforce a 5-minute expiration TTL.
  - *(Status: Implemented in `apps/daemon/src/harness/tools.ts`).*

### Boundary 3: Workspace Path Containment & Process Isolation
- **Invariant:** The agent and its tools can never read, modify, or execute files outside the designated repository workspace.
- **Enforcement & Limitations:**
  - *Path Canonicalization*: `fs.realpathSync()` guards against directory traversal in static file operations (`../../`), but application-level path checks alone do not prevent shell subprocess escapes (e.g. `cd .. && rm -rf`) or filesystem TOCTOU symlink races.
  - *Blacklisted Targets*: Explicitly blocked: `.git/`, `.env*`, `~/.ssh`, `~/.aws`, OS system directories.
  - *Subprocess Lifecycle Isolation*: Subprocesses execute in isolated process groups (`detached: true`) to ensure clean cleanup, but detached process groups are for process tree management and do **not** constitute an OS security sandbox.
  - *True Hypervisor Sandboxing*: True kernel-level isolation is provided by Kiri MicroVM containers per ADR-006 (`docs/decisions/ADR-006-kiri-microvm-execution-sandbox.md`).
  - *Output Bounding*: Standard output and error streams are truncated at **8,192 bytes** to prevent buffer exhaustion and context flooding.
  - *(Status: Path checks and process scoping implemented; Kiri MicroVM container runtime planned under HAR-010).*

### Boundary 4: Credential Protection & Egress Proxies
- **Invariant:** The execution sandbox and browser client have zero direct access to foundation model API credentials.
- **Enforcement & Implementation Status:**
  - Model API keys are held server-side by the daemon and are never forwarded to the browser or CLI.
  - All LLM requests route through Vercel AI SDK Core model providers.
  - *Network Egress Controls (Planned)*: Private network IP blocking (`10.0.0.0/8`, `192.168.0.0/16`, `127.0.0.1`, IPv6 `::1`, `169.254.169.254`) must be enforced at the egress proxy layer with DNS pinning to defeat DNS rebinding on outbound HTTP tool calls.

---

## 3. Telemetry Privacy & Attribute Allowlist

To prevent proprietary source code, prompts, and credentials from leaking into observability platforms:
- OpenTelemetry spans exported to observability sinks must pass an **Attribute Allowlist**.
- **Explicitly Redacted / Forbidden from Telemetry:**
  - `prompt.text`, `prompt.system`, `model.completion`
  - `file.content`, `git.diff`, `tool.stdout`, `tool.stderr`
  - `auth.token`, `api.key`, `session.cookie`, `X-Kantha-CLI-Token`
  - Absolute local filesystem paths (must be normalized to relative workspace paths).
- Detailed run evidence is stored in access-controlled, local or artifact storage referenced only by opaque IDs (`artifactId`).
