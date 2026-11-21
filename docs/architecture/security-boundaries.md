# Security Boundaries & Isolation Policy

**Status:** Canonical security architecture.
**Source References:** `docs/harness/HARNESS.md`, `docs/gateway/CONTRACTS.md`, `src/lib/gateway/server/ingress.ts`, `src/lib/gateway/server/secret-store.ts`

## 1. Security Threat Model & Principles

Kantha executes arbitrary AI-generated code and tool invocations against source code repositories. To maintain system integrity and prevent unauthorized egress or data corruption, four strict boundaries are maintained:

```
[Untrusted: LLM Output & Repository Content]
         │
         ▼  (Boundary 1: Model Context & Prompt Injection Defense)
[Harness Instruction & Tool Validation Layer]
         │
         ▼  (Boundary 2: Policy & Approval Gate)
[Tool Action Policy (Allow / Ask / Deny)]
         │
         ▼  (Boundary 3: Workspace & Process Isolation)
[Isolated Execution Environment / Sandbox]
         │
         ▼  (Boundary 4: Network & Credential Egress)
[Gateway Secret Store & Outbound Proxy] ──> External Services
```

## 2. The Four Security Boundaries

### Boundary 1: Untrusted Model & Context Separation
- **Principle:** Repository text, file contents, git commit messages, and LLM completions carry **zero authority**.
- They cannot grant permissions, upgrade roles, bypass rate limits, or invoke unauthorized tools.
- Authority is derived solely from the Gateway's server-authenticated `RequestContext`.
- In-context instructions from `AGENTS.md` or skills can guide tool selection but cannot expand tool privileges beyond the task's granted scope.

### Boundary 2: Action Policy and Human Approvals
- Every proposed tool call is evaluated against an action policy:
  - **Allow:** Safe, read-only operations within allowed root paths (e.g., `file_read`, `directory_list`).
  - **Ask:** Mutating or high-risk operations (e.g., destructive file edits, shell execution, database migrations). Execution suspends until an authorized human decision is submitted.
  - **Deny:** Explicitly forbidden operations (e.g., path traversal outside repository root, reading `.env` files, modifying git hooks).
- Approvals bind: `actorId`, `workspaceId`, `runId`, `actionId`, normalized arguments digest, and expiry timestamp. A change in arguments or action invalidates the approval.

### Boundary 3: Workspace & Filesystem Isolation
- Tool execution is constrained to granted repository paths.
- Paths are sanitized and resolved against the workspace root; attempts to use relative traversals (`../`) outside the repository boundary throw validation errors.
- A worktree shares host privileges; therefore, arbitrary shell execution is disabled by default until qualified isolated container or VM execution environments are enabled.
- File modifications capture pre-execution diffs and verify that baseline dirty state created by the user is preserved.

### Boundary 4: Credential Protection and Outbound Egress
- Provider API keys and secret credentials reside exclusively in the Gateway's server memory or encrypted `SecretStore`.
- Credentials are **never** passed to the browser, never included in SSE event streams, never logged in OpenTelemetry spans, and never injected into LLM prompt contexts.
- Outbound network requests to AI providers use server-managed egress proxies that validate destination hostnames against configured provider endpoints.
- Internal private IP ranges (e.g., `10.0.0.0/8`, `192.168.0.0/16`, `127.0.0.1`, cloud metadata endpoints `169.254.169.254`) are blocked unless explicitly configured by deployment policy.

## 3. Telemetry and Data Privacy

Following the operations contract (`docs/harness/features/OPERATIONS.md`):
- OpenTelemetry spans exported via OTLP to SigNoz must pass an attribute allowlist.
- **Strictly Redacted / Excluded from Telemetry:**
  - Full prompt text and raw completions
  - Source code files and unified diffs
  - Absolute local filesystem paths
  - Raw tool arguments and execution output
  - User credentials, bearer tokens, and session cookies
  - Raw exception stack traces containing sensitive context
- Detailed run evidence is stored in access-controlled, scoped artifact storage referenced by opaque IDs (`artifactId`).
