# Workspace preparation and repository access

Proposed feature contract. H0 establishes the fixture and H3 qualifies repository operations. See A4, A7 and A8 in the [implementation plan](../IMPLEMENTATION-PLAN.md).

## Ownership and contract

The gateway grants repository access. The workspace service turns that grant into an opaque workspace reference with repository identity, base revision, baseline changes and environment profile. The executor enforces repository roots and the permitted operation at execution time. The runner consumes workspace metadata and typed outcomes.

Preflight records startup and check availability before edits. Read and search return bounded results. Patch accepts expected file state and a bounded change. It returns changed paths and a receipt or a stale-state outcome. Preparation and cleanup record ownership of workspace resources. Use a separate qualified execution boundary for repository-provided code. A worktree alone shares host privileges.

## Preflight decisions

Record which entry points and verification commands are available, their relevant baseline outcomes, and the revision and environment used. Classify each baseline check as passing, known failing or unavailable, with evidence. An expected failing regression check can establish the need for the task. A missing prerequisite blocks edits that depend on it. A known unrelated failure may allow scoped work to proceed if the acceptance plan supports independent verification and reports the baseline failure. Required final criteria still need valid passing evidence. Revalidate workspace identity and protected changes after recovery and before the final verdict.

## Build order and integration

1. Build a controlled repository fixture with pre-existing edits, a small expected patch and a known verification command. Record baseline revision and status.
2. Prepare the workspace under the grant from [gateway ingress](../../../src/lib/gateway/server/ingress.ts). Pass an opaque reference to [sessions](SESSIONS.md), [tools](TOOLS.md) and the [verifier](VERIFICATION.md).
3. Implement scoped repository operations. Detect stale files and reject escapes, including symlink or junction traversal. For an operation affecting multiple files, document how partial application can be identified and reconciled.
4. Finalize with a scoped diff or artifact and a cleanup disposition. Preserve the user’s baseline edits and record the status of owned temporary resources.

## Acceptance scenarios

- Prepare from a fresh and a dirty checkout. Patch only intended paths, retain baseline edits and validate output against the recorded base.
- Remove a required environment prerequisite and verify that dependent repository mutations are never dispatched. Run a separate case with an attributable unrelated baseline failure and prove the scoped outcome using the approved checks.
- Reject a foreign grant, revoked grant, root escape and stale expected state. Assert unchanged target state after rejection.
- Interrupt a patch after dispatch and reconcile the actual file state by action identity. Verify the next session can initialize and that owned files or processes are released or explicitly retained with a reason.

Add filesystem and execution-boundary integration fixtures for the target platform. Use the [harness tool rules](../HARNESS.md#tools-and-permissions) and [gateway contracts](../../gateway/CONTRACTS.md).
