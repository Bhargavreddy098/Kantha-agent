# Harness observability and evaluation

Proposed contract. H0–H1 establish repeatable fixtures and operation correlation. H5 qualifies the [release checks](../IMPLEMENTATION-PLAN.md#acceptance-matrix) A8 and A9. The [verification contract](VERIFICATION.md) governs completion of an individual run.

## Observability decision

Use OpenTelemetry (OTel) in the gateway and harness, export via OTLP through an OpenTelemetry Collector, and use **SigNoz** as the hosted observability backend. A single view of traces, metrics and logs supports diagnosis across Chat, inference, workspace tools, verification and recovery. Keep structured JSON logs available for local development. Evaluation cases, scores and release decisions live in the repository runner and CI. SigNoz can display aggregate results when useful. [OpenTelemetry JavaScript](https://opentelemetry.io/docs/languages/js/) · [SigNoz OTLP ingestion](https://signoz.io/docs/ingestion/signoz-cloud/overview/)

| Boundary | Capture |
| --- | --- |
| Submission and runner | Admission outcome, run duration, queue age, phase, preflight outcome, cancellation latency and recovery disposition. Link a recovered execution to the original run. |
| Model and context | Provider/model, logical step and attempt IDs, outcome, latency, reported usage, context size, compaction outcome and retry reason. Cost and usage totals come from the gateway ledger with explicit unknowns. |
| Policy and executor | Decision class, tool ID, side-effect class, approval wait, execution result, bounded output sizes and reconciliation outcome. Link attempts to the stable action ID. |
| Verification and operations | Check outcome, repair count, cleanup disposition, worker saturation, exporter drops and projection lag. Use bounded dimensions for metrics. Keep opaque run and action IDs in spans and structured logs. |

Use an attribute allowlist before export and filter again at the Collector. Default fields exclude prompts, completions, source code, diffs, filesystem paths, raw tool arguments/results, credentials and raw exception messages. Confirm export and access controls with synthetic canaries. Use authorized artifact references for detailed evidence. Bound exporter queues and timeouts. Disable or drop telemetry under failure or saturation while runs, approvals, settlement, evidence and SSE continue. Keep audit in application storage.

## Repository evaluation suite

Run deterministic state and policy tests, scripted integration and restart scenarios, isolated repository episodes and staging smoke. Add an independent reviewer for criteria that require judgment. A required failed or blocked deterministic check always vetoes success. Use sanitized, deterministic scripted responses or replay fixtures for routine CI, and keep live-model episodes as a separately labeled qualification lane.

Each case pins task text, baseline commit, dirty-state setup where relevant, tool and environment profiles, model settings, acceptance criteria and verifier version. Each episode gets a fresh workspace, session and budget. Take required check instructions from the trusted scenario definition and run them against the candidate state. Assert the required behavior, protected changes, stop/recovery outcome and side effects. Keep the verifier and case expectations outside the candidate's write scope.

| Scenario family | Required observation |
| --- | --- |
| Localized behavior change | Repair the existing formatter example and preserve unrelated dirty work. |
| Ambiguous or incomplete request | Resolve a routine assumption from repository evidence. In a separate episode, leave a material behavior choice unresolved and verify that affected writes are blocked with a concrete handoff. |
| Cross-module change | Update a caller and its implementation across instruction scopes. Assert compatibility and leave an unrelated module untouched. |
| End-to-end behavior | Exercise a task whose isolated component checks pass while its public entry point fails. Verify that the final verdict follows the public behavior. |
| Premature completion | Script a success claim after one of several required outcomes passes. Verify the grader detects the omitted outcome even if the candidate changes its own test expectations. |
| Inconclusive baseline | Run with a known pre-existing failure and an unavailable required check in separate episodes. Attribute the baseline failure and report blocked when required evidence is missing. |
| Interrupted operation | Restart around a pending approval, a recorded result and an ambiguous action outcome in separate episodes. Preserve identities, deduplicate known results and halt dependent work on uncertainty. |
| Scope and progress | Deny an out-of-scope write and force repeated failed repair attempts. Verify zero denied dispatches, bounded retries, useful handoff and usable workspace state. |
| Context continuity | Resume a deliberately long task after compaction in a fresh worker. Preserve acceptance criteria, current scope and unresolved action identity. |

Use at least two independent pinned repositories for release qualification, with a real task through staged Chat. Include distinct task shapes such as a localized bug fix, a cross-module compatibility change and a feature with multiple observable outcomes. Run the same harness entry points and lifecycle for each, changing only the task, repository profile and check definitions. For a live model or harness comparison, run at least three fresh episodes per task and candidate with the same settings and report the per-case outcomes and sample size. Record task success, false completion, unauthorized dispatch, duplicate effects, recovery, intervention, elapsed time and billed usage or unknown usage. Version the scenario set, accepted baseline and performance tolerances before comparing candidates. Any false completion, unauthorized dispatch, duplicate effect or failed required release scenario blocks qualification. Review quality, cost and duration against the pinned tolerances.

Turn recurring failures into sanitized regression cases. Classify each by scope, context, environment, state or feedback, reproduce it where possible, then compare the candidate with the pinned baseline. Promote reusable guidance only through a reviewed, versioned change with regression evidence. A run's notes remain scoped to its authorized task and carry source provenance.

## Acceptance

- Slow or stop the collector in staging. Run Chat, settle provider attempts, reconnect and read evidence. Confirm bounded export and unchanged authoritative outcomes. Inspect captured metadata for absence of the synthetic sensitive fields.
- Execute the suite twice with fixed fixtures and verify consistent verdicts. Make a required check fail while a reviewer approves the patch and observe a failed verdict. Change the candidate after a pass and verify the prior result is stale.
- Publish the case versions, candidate versions, episode outcomes and authorized evidence references with the H5 release record.
