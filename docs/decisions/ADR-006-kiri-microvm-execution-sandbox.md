# ADR-006: Adopt Kiri MicroVM Container Runtime for Host Sandboxing

**Status:** PROPOSED — Awaiting Human Approval  
**Date:** 2026-11-21  
**Deciders:** Principal Software Architect, Security Lead  
**Technical Area:** Execution Sandboxing, Subprocess Isolation, Security Boundaries  
**Supersedes / Amends:** Amends ADR-005 (replaces heavy Docker/Podman standard with Kiri microVM runtime)  

---

## Context
In ADR-005, Kantha established a two-tier sandboxing architecture:
- Tier 1: Local Git Worktrees with in-process path checks.
- Tier 2: Heavy Docker / Podman containers for production.

However, comparative analysis against leading coding agents (OpenCode, Claude Code) and security audit findings revealed critical gaps:
1. **Permissions != Sandboxing:** An application-level approval dialog (e.g. "Allow `npm test`") does not protect the host if a malicious dependency, postinstall hook, or test script accesses `~/.ssh`, `~/.aws`, or host `.env` files.
2. **Traditional Docker overhead is prohibitive locally:** Docker Desktop takes 5–15 seconds to spin up, consumes 2–4 GB of idle RAM, and has restrictive licensing.
3. **Pure Worktrees lack process containment:** Git worktrees isolate repository files, but commands executed via `child_process.spawn` run directly on the host kernel with full host ambient permissions.

---

## Decision
Adopt **Kiri** (`libracoder/kiri`, `runkiri.com`) as Kantha's core container and execution sandbox runtime for both local development and deployment:
1. **Rust-Based MicroVM Engine:** Kiri spins up a minimal (~10MB) Linux kernel in ~2.5 ms using native hypervisors (WSL2/Hyper-V on Windows, Virtualization framework on macOS, cgroups on Linux).
2. **Zero Idle Overhead:** Kiri automatically suspends to RAM when idle and wakes instantly upon receiving API calls.
3. **Docker Engine API Standard:** Kiri implements standard Docker Engine API endpoints (`/var/run/docker.sock` and `\\.\pipe\docker_engine`). Kantha integrates using the standard `dockerode` client library without proprietary SDK lock-in.
4. **Hard OS Containment Invariants:**
   - Worktree mounted at `/workspace` (rw).
   - Read-only root filesystem (`ReadonlyRootfs: true`).
   - Dropped capabilities (`CapDrop: ['ALL']`).
   - Non-root user (`UID 1000:1000`).
   - Memory capped at 2GB, CPU at 2.0 cores, PIDs at 256.
   - Network blocked by default (`NetworkDisabled: true`).

---

## Consequences

### Positive
- True hypervisor-level defense against malicious code, supply-chain attacks, and accidental host corruption.
- Instant startup (<50ms vs >2,000ms for Docker Desktop) enables real-time agent tool loops.
- Standard Docker API compatibility allows seamless portability across developer laptops and CI/CD runners.
- Zero idle battery and memory drain when the agent is waiting on user input or LLM generation.

### Negative / Trade-offs
- Requires developers to install the `kiri` binary on their host machine.
- Introduces `dockerode` and `@types/dockerode` as server-side dependencies.
