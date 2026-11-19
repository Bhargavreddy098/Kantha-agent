# Agent definitions, context and skills

Proposed feature contract. H3 implements this area. See acceptance checks A4 and A6 in the [implementation plan](../IMPLEMENTATION-PLAN.md).

## Ownership and contract

An agent definition supplies versioned instructions and a run profile, including limits and eligible capabilities. The gateway determines authority. The context builder assembles one request from the authorized task, pinned instructions, selected skill bodies, model-visible journal window, unresolved work and tool snapshot. The runner consumes the context builder output.

Skill discovery returns ID, description, applicability, source and version or digest from eligible bundles. Loading resolves a selected version and permitted references and returns bounded text with provenance. A skill can instruct use of a tool. Every invocation still goes through the tool and action contracts.

Persist the agent version, instruction sources and selected skill digests with the run. Preserve the original journal through compaction. Checkpoint derived summary coverage, retain unresolved calls and criteria, and include only journal entries past the summary watermark on replay.

Pin a context profile per selected model. Reserve output and any provider-specific reasoning allowance before budgeting input. Count tool schemas and message framing with the pinned tokenizer or a conservative documented estimator. Preserve task scope, required criteria, applicable mandatory instructions, current tool schemas, and unresolved call/result pairs. Trim optional references and inactive skill detail first, then compact the oldest complete exchanges when the next request would exceed its input budget. Persist summary coverage and keep the original events. If the mandatory set cannot fit, end with a typed context limit and name the unavailable capacity. Provider-private reasoning stays out of the portable journal and UI. Qualify model-specific limits and the trigger during H2–H3.

## Build order and integration

1. Define fixture agent profiles and skill bundles, including duplicate IDs, conflicting instructions, an unavailable version and references outside the eligible source.
2. Resolve repository guidance at the pinned revision. Read root `AGENTS.md`, follow its applicable references and add nested instructions as the task enters their scope. Record the scope and source used.
3. Expose metadata-first skill discovery and scoped load through the [tool registry](TOOLS.md). Assemble a request with the [session journal](SESSIONS.md) and a deterministic context budget.
4. Exercise compaction and restart on the same run. Surface safe skill and context progress through [Chat and events](CHAT-EVENTS.md) where useful.

## Acceptance scenarios

- Run a fixture task spanning two directories. Assert applicable root and scoped instructions enter the right requests, eligible skill metadata is available, and only selected skill text is loaded.
- Change the skill catalog during a run. The current run retains pinned versions. A revoked grant blocks protected loads. Unavailable required content yields a concrete blocked reason.
- Compact after a complete tool exchange with a second action pending. Restart and compare reconstructed context with the checkpoint, retaining approval, correct ordering and verification criteria.

Add focused resolver and compaction fixtures plus one scripted run test. Read the [OpenCode agent schema and skill sources](../SOURCES.md#useful-source-documents) alongside the [Kantha context rules](../HARNESS.md#skills-and-repository-instructions).
