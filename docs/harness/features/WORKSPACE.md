# Workspace preparation and repository access

Proposed feature contract. H0 establishes the fixture and H3 qualifies repository operations. See A4, A7 and A8 in the [implementation plan](../IMPLEMENTATION-PLAN.md).

## Ownership and contract

The gateway grants repository access. The workspace service turns that grant into an opaque workspace reference with repository identity, base revision, baseline changes and environment profile. The executor enforces repository roots and the permitted operation at execution time. The runner consumes workspace metadata and typed outcomes.

Preflight records startup and check availability before edits. Read and search return bounded results. Patch accepts expected file state and a bounded change. It returns changed paths and a receipt or a stale-state outcome. Preparation and cleanup record ownership of workspace resources. Use a separate qualified execution boundary for repository-provided code. A worktree alone shares host privileges.

## First production workspace profile

Run approved checks in a disposable Linux VM with a pinned image, an unprivileged account, bounded resources and a default-deny network policy. The VM receives a staged repository snapshot and designated output storage. Keep provider credentials, host home directories, host sockets and the user's live checkout outside the guest. Restrict reads and patch writes to the granted relative roots, reject symlink and junction traversal during capture and execution, and qualify Stop, timeout, cleanup and recovery before enabling effects. The deployment must supply and qualify the VM implementation.

The workspace owner captures the pinned base and a manifest of authorized staged, unstaged and untracked changes, including deletions and modes where supported. Exclude ignored content unless the repository profile explicitly includes it. Verify the manifest is stable across capture and abort if files changed during capture. Materialize the captured bytes into the isolated workspace. Preserve baseline edits by requiring each patch to match expected file state and by checking the final candidate against the baseline, including when a file contains both user and candidate edits. Block ambiguous overlap. Persist a revision and snapshot digest so recovery can check the same baseline or fail safely.

V1 accepts one existing regular file per patch action. Validate scope, expected pre-change digest and baseline protection under the current writer claim. Stage candidate bytes on the same filesystem, record the intended pre- and post-change digests, then atomically replace the file and durably record its outcome. Reject a multi-file request before dispatch. Runs can change several files through separate actions, each with its own intent and receipt. After an interrupted replacement, compare the authorized target against the recorded pre- and post-change identity under the workspace fence. Resolve only when that evidence is conclusive. Otherwise mark the effect unresolved and follow [operator disposition](APPROVALS.md#unresolved-effects).

The first release delivers an authorized patch relative to the captured baseline and a candidate identity. If the workspace owner retains a snapshot, show that disposition in the handoff. Changes in this profile are produced in the isolated candidate. Applying, committing, publishing or discarding a live target requires a separately qualified workflow. A follow-up task captures a fresh baseline from its authorized repository target. It inherits prior candidate changes only if the user explicitly selects a supported retained candidate and the gateway revalidates its grant and identity.

## Preflight decisions

Record which entry points and verification commands are available, their relevant baseline outcomes, and the revision and environment used. Classify each baseline check as passing, known failing or unavailable, with evidence. An expected failing regression check can establish the need for the task. A missing prerequisite blocks edits that depend on it. A known unrelated failure may allow scoped work to proceed if the acceptance plan supports independent verification and reports the baseline failure. Required final criteria still need valid passing evidence. Revalidate workspace identity and protected changes after recovery and before the final verdict.

## Build order and integration

1. Build a controlled repository fixture with pre-existing edits, a small expected patch and a known verification command. Record baseline revision and status.
2. Prepare the workspace under the grant from [gateway ingress](../../../src/lib/gateway/server/ingress.ts). Pass an opaque reference to [sessions](SESSIONS.md), [tools](TOOLS.md) and the [verifier](VERIFICATION.md).
3. Implement scoped repository operations and single-file patch actions. Detect stale files and reject escapes, including symlink or junction traversal. Verify atomic replacement and recovery between replacement and receipt.
4. Finalize with a scoped diff or artifact and a cleanup disposition. Preserve the user’s baseline edits and record the status of owned temporary resources.

## Acceptance scenarios

- Prepare from a fresh and a dirty checkout. Patch only intended paths, retain baseline edits and validate output against the recorded base.
- Remove a required environment prerequisite and verify that dependent repository mutations are never dispatched. Run a separate case with an attributable unrelated baseline failure and prove the scoped outcome using the approved checks.
- Reject a foreign grant, revoked grant, root escape and stale expected state. Assert unchanged target state after rejection.
- Reject a multi-file patch as one action. Interrupt a run between two valid single-file actions and verify the handoff reports the first confirmed change separately from the second.
- Interrupt a patch after dispatch and reconcile the actual file state by action identity. Verify the next session can initialize and that owned files or processes are released or explicitly retained with a reason.

Add filesystem and execution-boundary integration fixtures for the target platform. Use the [harness tool rules](../HARNESS.md#tools-and-permissions) and [gateway contracts](../../gateway/CONTRACTS.md).
