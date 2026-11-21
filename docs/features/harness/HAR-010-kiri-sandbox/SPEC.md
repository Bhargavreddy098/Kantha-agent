# Feature Specification: HAR-010 — Kiri MicroVM Execution Sandbox & Workspace Isolation

**Status** Proposed design · [Task breakdown](TASKS.md) · [Current state](../../../CURRENT_STATE.md)

HAR-010 gives the Harness a run-owned workspace and a qualified process boundary for repository commands. The task breakdown starts with the fixture-backed contracts, then builds the Git and Kiri adapters independently, then verifies them together through the Harness. The [workspace contract](../../../harness/features/WORKSPACE.md) defines the broader production workspace and patch workflow.

Use the [sandbox interfaces](../../../../src/lib/harness/sandbox/contracts.ts) for the current TypeScript signatures. The linked Kiri design includes illustrative code and open design decisions.

## 1. Feature ID and Name
- **Feature ID:** `HAR-010`
- **Name:** Kiri MicroVM Execution Sandbox and Workspace Isolation
- **Milestone:** H3 / H4 Core Security Gate
- **Parent Architecture Domain:** Harness Execution Subsystem
- **Specification Document:** [docs/specs/SPEC-kiri-sandbox.md](../../../specs/SPEC-kiri-sandbox.md)
- **Architecture Decision Record:** [ADR-006: Kiri MicroVM Sandboxing](../../../decisions/ADR-006-kiri-microvm-execution-sandbox.md)

## 2. Purpose
Provides kernel- and hypervisor-level isolation for agent-invoked shell commands, script executions, and package builds using Kiri (`libracoder/kiri`). Protects the host filesystem, environment variables, credentials, and processes from AI hallucinations, untrusted dependencies, and prompt injection attacks.

## 3. Architecture Owner
- **Primary Owner:** Harness Subsystem (`src/lib/harness/sandbox/`)
- **Boundary with Gateway:** Receives authorized run leases and permission grants from Gateway; executes commands exclusively inside the isolated container.

## 4. Key Security Invariants
1. **Worktree Containment:** Commands operate exclusively within an ephemeral Git worktree mounted at `/workspace`.
2. **Credential Exclusion:** `~/.ssh`, `~/.aws`, `.env`, and OS directories are completely unmounted and unreachable.
3. **Dropped Capabilities:** All Linux kernel capabilities dropped (`CapDrop: ['ALL']`).
4. **Resource Caps:** Hard limits on memory (2GB), CPU (2.0 cores), and PIDs (256) prevent fork bombs and CPU lockups.
5. **Output Bounding:** Output streams (stdout/stderr) are strictly bounded to 8,192 bytes.
6. **Process Defaults:** Run as a non-root user, with a read-only root filesystem and network access disabled by default.
