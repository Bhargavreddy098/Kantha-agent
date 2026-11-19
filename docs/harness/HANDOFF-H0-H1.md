# H0 + H1 implementation handoff

Status: H0 baseline and H1 durable single-session runner are implemented in code. Slices H2–H5 remain proposed. This is fixture and in-process evidence, not staging qualification.

## Scope delivered

- **H0 fixture:** scripted model scenarios (`pass`, `fail`, `cancel`, `malformed`), a controlled repository fixture with a dropped zero value and one unrelated dirty file, an acceptance plan with two required checks, and a deterministic verifier. `src/lib/harness/fixture.ts`, `src/lib/harness/scenario.ts`.
- **H1 backend:** domain contracts, durable admission and checkpoint with stable source event IDs, storage-enforced single-writer claims with generation fencing, a pinned tool registry with one inert tool, and a bounded runner that persists a terminal tool result before a dependent step. `src/lib/harness/`.
- **Gateway wiring:** harness store/projection adapters over `GatewayDatabase` and `GatewayRunService`; composition in `GatewayRegistry`; versioned `harness.*` events in the existing SSE feed; API routes for submit, snapshot, cancel and restart recovery.
- **Frontend connection:** browser client, an SSE/reconnect hook that deduplicates by `sourceEventId`, and a Chat collapsible panel using Astryx public subpaths. Ordinary chat and its transport are unchanged.
- **Checks:** `scripts/test-harness-fixtures.mjs` (`npm run test:harness`).

## Checks run

- `node scripts/test-harness-fixtures.mjs` — 9 assertions passed, including a real `GatewayDatabase(':memory:')` + `GatewayRunService` integration proving replay, conflict, streamed deltas, terminal status, Stop and event projection. Fault injection after the mapping commits and before journal admission verifies request replay and durable recovery while the gateway run lease is active. Both deliver the original input and record one inert tool result.
- `node scripts/test-gateway-fixtures.mjs` — 54 baseline assertions passed.
- `npx eslint` on all harness files — clean.
- TypeScript: no errors in files touched by this handoff (full-repo `tsc`/`next build` type check is blocked by pre-existing errors in the untracked `packages/ui` tests and missing local `@/components/ui/*` modules in this worktree). Webpack production compile succeeds.

## Unresolved work

- Browser E2E and staging smoke (A1, A6, A8) are not yet run; they require a complete production build and a qualified environment.
- H2 real provider inference and per-attempt accounting, H3 workspace/skill tooling, H4 approvals and bounded repair, and H5 release qualification remain unimplemented.
- The fixture gateway still expires a run when its lease elapses. Delayed restart and redelivery after that window require qualification and a durable hosting lifecycle under H2.
- The full build's type check fails on unrelated existing files; restore or replace the deleted local UI modules and install the `@astryxdesign/*` test dependencies before treating the build as green.

## Next action

Resolve the pre-existing build blockers, run the browser flow for submit → reconnect → Stop → evidence, then begin H2 by replacing `ScriptedInference` with the gateway-mediated inference seam while keeping the journal and projection contracts unchanged.
