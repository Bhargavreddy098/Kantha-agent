# ADR-005: Git Worktree Containment for Local Mode, Rootless Containers for Production

**Status:** ACCEPTED FOR PLANNING  
**Date:** 2026-11-21  
**Deciders:** Principal Software Architect, Security Lead  
**Technical Area:** Workspace Isolation & Tool Security

---

## Context
Kantha agents autonomously generate unified diffs and execute build and verification commands against code repositories. Executing commands directly against the user's primary working directory risks:
1. Corrupting uncommitted user modifications.
2. Accidental destructive shell actions (`rm -rf`, modifying `.git`).
3. Execution of malicious scripts if an untrusted repository is inspected.

---

## Decision
1. **Tier 1 (Local Development & H1–H3): Controlled Git Worktrees**
   - Automatically spawn an isolated Git worktree (`git worktree add -b kantha-run-<runId>`) in `.gateway-data/workspaces/<runId>`.
   - Record baseline uncommitted user edits (`git status --porcelain`) prior to any agent action.
   - Enforce path canonicalization (`fs.realpathSync()`) to strictly forbid filesystem traversal outside the worktree.
   - Truncate standard output/error streams at 8,192 bytes.
   - Cleanup worktree and temporary branch upon run finalization.
2. **Tier 2 (Staging, Production & H4–H5): Rootless Container Sandbox**
   - Execute all tool actions and test commands inside a rootless container sandbox (Docker / Podman / MicroVM).
   - Container has dropped Linux capabilities (`DROP ALL`), read-only root filesystem, memory limits (2GB), CPU limits (2.0 cores), and blocked network access by default.

---

## Consequences
### Positive
- Zero risk of an agent overwriting or destroying a developer's in-progress working tree.
- Fast, zero-overhead worktree creation in local mode (<100ms).
- High-grade multi-tenant containment in production staging.

### Negative
- Requires Git 2.5+ installed on the host OS for worktree support.
- Requires container runtime (Docker/Podman) installed for production environments.
