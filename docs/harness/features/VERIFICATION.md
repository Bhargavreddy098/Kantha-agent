# Verification, evidence and handoff

Proposed feature contract. H0 defines checks and H4–H5 integrate and qualify verification. See A7 and A8 in the [implementation plan](../IMPLEMENTATION-PLAN.md).

## Ownership and contract

The task plan owns observable acceptance criteria and the declared check references. The verification service determines pass, fail or blocked from evidence for the candidate workspace state. The runner can request bounded repairs based on check results. It treats the verifier’s verdict as authoritative.

Each criterion has a stable ID, behavior, check reference and required status. Each result records run, criterion, command or review identity, workspace revision or diff digest, status and evidence reference. A changed candidate invalidates affected prior evidence. A required unavailable check blocks success. Judgment-based review uses task requirements, the diff and check evidence independently of the implementer’s reasoning.

## Completion and repair decisions

- The runner's request to finish starts verification. Only the verification service can produce a passing verdict. Record an explicit result for every required criterion, including criteria that could not be evaluated. Check the supported entry point when the user requested a behavior that spans components.
- Pin the required criteria and verifier inputs before candidate edits. Evaluate changes to test files, fixtures or check configuration as candidate work. Required independent checks remain under verifier control so a patch that weakens its own checks cannot establish success. Material changes to acceptance criteria require authorization through the task boundary and invalidate affected verdicts.
- Record each failed criterion with the candidate identity, expected and observed outcomes, evidence reference and failure category when known. Send the runner the actionable findings and remaining repair budget. Repeated identical findings against unchanged relevant state stop the repair loop unless a known transient failure permits a bounded retry. Preserve repair counts and prior findings across restart.
- Generate the handoff from durable records. Include the requested outcome, what passed and against which candidate, what remains incomplete, baseline failures, unresolved effects, cleanup and the next safe action. Validate it by reopening the run without the prior model context.

## Build order and integration

1. Write a fixture task with known passing and failing inputs. Pin the acceptance plan and approved check profiles during [workspace preparation](WORKSPACE.md).
2. Execute checks through the qualified executor. Apply time and output bounds and capture exit status and authorized evidence. Feed failed criteria back to the runner under the pinned repair limit.
3. Recheck the final candidate and independently determine completion. Persist verdict, remaining criteria, final repository identity, artifact references and cleanup disposition before projecting a terminal outcome.
4. Produce a human-readable handoff from durable evidence. Include scope, changes, check results, blocked items, unresolved effects and the next step.

## Acceptance scenarios

- Start from a failing fixture, repair it and prove the required check passes against the final candidate. Change the candidate after a green result and confirm the stale result cannot advance completion.
- Exercise a skipped or missing check, a timeout and exhausted repair limits. Surface evidence and remaining work. Keep the outcome short of completed while required criteria remain unresolved.
- Script an assistant that claims success after satisfying just one of two required outcomes, then edits its own test expectations to hide the second. Keep the independent check authoritative and report the unfinished criterion. Repeat the same failed candidate after a restart and verify the repair budget and stop condition survive.
- Run staged acceptance through the normal Chat flow. Reopen the staged run in a fresh session and verify that its authorized evidence and cleanup status support continuation.

Use the [release acceptance matrix](../IMPLEMENTATION-PLAN.md#acceptance-matrix) for cross-feature gates, the [repository evaluation suite](OPERATIONS.md#repository-evaluation-suite) for repeatable quality checks across runs, and the [WalkingLabs verification and handoff references](../SOURCES.md#course-concepts-in-kantha) for patterns.
