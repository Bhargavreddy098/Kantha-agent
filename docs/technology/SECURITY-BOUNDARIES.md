# Technical Security Boundaries & Hardening Specification

**Status:** APPROVED FOR PLANNING — Awaiting Gate 2 Sign-off  
**Version:** 1.0.0  
**Effective Date:** 2026-11-21  
**Document Level:** Level 2 — Technology Specification

---

## 1. Multi-Tier Security Threat Model

Kantha operates in an environment where untrusted code, external LLM outputs, browser contexts, and arbitrary repository contents intersect. To ensure safe, non-destructive execution, Kantha enforces five non-negotiable security boundaries:

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
- **Invariant:** No unauthenticated request—whether via HTTP, SSE, or WebSocket—may execute commands, establish a PTY session, or access workspace resources. Restricting to loopback (`127.0.0.1`) alone is NOT an authorization boundary.
- **Enforcement ([ADR-007](../decisions/ADR-007-automatic-local-session-authentication.md)):**
  - **Host Validation:** Every incoming HTTP request and WebSocket handshake validates the `Host` header against the explicitly configured loopback address and port (`127.0.0.1:<port>` / `localhost:<port>`). DNS-rebound hostnames and malformed hosts fail-closed with `403 Forbidden`.
  - **Origin Fencing:** All state-changing requests (`POST`, `PUT`, `DELETE`), pairing handshakes, and WebSocket upgrades validate the `Origin` header. Cross-origin requests from external web pages are rejected. Permissive CORS (`Access-Control-Allow-Origin: *`) is strictly prohibited.
  - **Pairing Ticket Exchange:** Browser connection uses a high-entropy, ephemeral (60s TTL), single-use Pairing Ticket delivered exclusively via URL fragment (`#ticket=...`), which is never sent over the wire and purged via `history.replaceState()`.
  - **Cookie-Based Session:** Ticket is exchanged for an `HttpOnly`, `SameSite=Strict`, host-only `kantha_session` cookie that authenticates REST, SSE, and WebSocket PTY upgrades.
  - **In-Memory Lifecycle:** Secrets and active sessions reside in daemon memory; restarting the daemon immediately invalidates prior sessions.
  *(Status: Formalized in ADR-007; refactoring scheduled to replace prototype naive loopback handler in `apps/daemon/src/api/router.ts`).*

### Boundary 1: Zero In-Context Authority & Schema Enforcement
- **Invariant:** Neither repository file contents, commit messages, agent prompt instructions (`AGENTS.md`), nor LLM completions carry architectural authority.
- **Enforcement:**
  - Instructions from `AGENTS.md` can recommend tool usage but can **never** grant permissions, elevate workspace privileges, or bypass budgets.
  - All model-generated tool calls must pass strict runtime validation (via Zod schemas) before dispatch. Unparseable or malformed payloads throw `HarnessError('invalid_tool_call')`.

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

### Boundary 3: Workspace Path Containment & Process Isolation
- **Invariant:** The agent and its tools can never read, modify, or execute files outside the designated repository workspace.
- **Enforcement:**
  - Path canonicalization via `fs.realpathSync()` blocks symlink escapes and directory traversals (`../../`).
  - Blacklisted targets rejected unconditionally: `.git/`, `.env*`, `~/.ssh`, `~/.aws`, OS system directories.
  - Process execution: Subprocesses execute in isolated process groups (`detached: true`).
  - Output bounding: Standard output and error streams are truncated at **8,192 bytes** to prevent buffer exhaustion and context flooding.

### Boundary 4: Credential Protection & Egress Proxies
- **Invariant:** The execution sandbox and browser client have zero direct access to foundation model API credentials.
- **Enforcement:**
  - Keys reside in `gateway_documents.secrets` encrypted with AES-256-GCM.
  - All LLM requests route through the Gateway's `IHarnessInference` egress proxy.
  - Private network IP ranges (`10.0.0.0/8`, `192.168.0.0/16`, `127.0.0.1`, AWS metadata `169.254.169.254`) are blocked from outbound requests.

---

## 3. Telemetry Privacy & Attribute Allowlist

To prevent proprietary source code, prompts, and credentials from leaking into observability platforms:
- OpenTelemetry spans exported to SigNoz must pass an **Attribute Allowlist**.
- **Explicitly Redacted / Forbidden from Telemetry:**
  - `prompt.text`, `prompt.system`, `model.completion`
  - `file.content`, `git.diff`, `tool.stdout`, `tool.stderr`
  - `auth.token`, `api.key`, `session.cookie`
  - Absolute local filesystem paths (must be normalized to relative workspace paths).
- Detailed run evidence is stored in access-controlled, local or S3 artifact storage referenced only by opaque IDs (`artifactId`).
