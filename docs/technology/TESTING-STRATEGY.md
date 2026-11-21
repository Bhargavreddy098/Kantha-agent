# Testing Strategy & Quality Verification Matrix

**Status:** APPROVED FOR PLANNING — Awaiting Gate 2 Sign-off  
**Version:** 1.0.0  
**Effective Date:** 2026-11-21  
**Document Level:** Level 2 — Technology Specification

---

## 1. Testing Philosophy: The Verification Pyramid

In Kantha, code is never marked `DONE` based on an agent's self-assessed completion claim. Correctness must be established through a rigorous, multi-tiered testing pyramid:

```
               / \
              / E2E\            Tier 4: Playwright Browser & Reconnect Tests
             /------\
            /  Crash \          Tier 3: Fault Injection & Interruption Recovery
           /----------\
          / Concurrency\        Tier 2: Generation Fencing & Split-Brain Tests
         /--------------\
        / Unit & Fixtures\      Tier 1: Zero-Dependency Contract Assertions
       /------------------\
```

---

## 2. Test Tiers & Verification Scenarios

### Tier 1: Unit & Domain Contract Fixtures
- **Execution Engine:** Native Node.js scripts (`scripts/*.mjs`) and Node native test runner.
- **Characteristics:** Zero external test framework dependencies; in-memory database (`GatewayDatabase(':memory:')`); execution time < 2 seconds.
- **Current Verified Baseline (95 assertions passing):**
  - `scripts/test-gateway-fixtures.mjs`: Gateway ingress, secret storage, sessions, and usage accounting (54 assertions).
  - `scripts/test-harness-fixtures.mjs`: Journal append-only ordering, generation claims, and checkpoint save/restore (9 assertions).
  - `scripts/test-h2-inference.mjs`: Inference chunk streaming, token estimation, and multi-step continuation (32 assertions).

### Tier 2: Concurrency & Generation Fencing Tests
- **Objective:** Prove that two workers cannot write to the same session simultaneously and that stale leases are rejected.
- **Test Scenarios:**
  - `TEST-CONCUR-001 (Simultaneous Claim):` Two workers attempt to claim the same unassigned run; exactly one receives `generation = 1`, the second is rejected.
  - `TEST-CONCUR-002 (Heartbeat Expiration):` Worker A holds lease; heartbeat ceases; after `leaseMs`, Worker B reclaims at `generation = 2`.
  - `TEST-CONCUR-003 (Stale Write Rejection):` Worker A wakes from simulated GC pause and attempts to append to the journal; write is rejected with `HarnessError('stale_claim')`.
  - `TEST-CONCUR-004 (Duplicate Submission):` Concurrent submissions of identical `(workspaceId, inputId)` return the same `runId` without duplicate job creation.

### Tier 3: Fault Injection & Interruption Recovery Tests
- **Objective:** Prove that cold workers resume cleanly after process crashes without duplicate side effects.
- **Test Scenarios:**
  - `TEST-CRASH-001 (Kill during Model Inference):` Kill worker during LLM request; recovering worker checks ledger and resumes step `N` without duplicate billing.
  - `TEST-CRASH-002 (Kill during Tool Execution):` Kill worker while tool is executing; recovering worker inspects `pendingActionId` and calls `reconcile()`. If file modification receipt exists, absorbs result into journal.
  - `TEST-CRASH-003 (Uncertain Outcome Halt):` Kill worker during destructive bash script where receipt cannot be proven; recovering worker halts run with `interrupted` status to prevent double-execution.

### Tier 4: End-to-End Browser & Integration Tests (Playwright)
- **Execution Engine:** Playwright (`npm run test:e2e`).
- **Test Scenarios:**
  - Task submission via UI modal.
  - Real-time streaming of assistant text and step cards via SSE.
  - Approval flow: Mutating action triggers UI modal; clicking "Approve" resumes runner.
  - Network drop simulation: Browser disconnects for 10 seconds; reconnects with `Last-Event-ID` and verifies gap-free event replay.

### Tier 5: Repository Evaluation Benchmark Suite (Milestone H5 Release Gate)
- **Objective:** Measure real-world engineering accuracy against pinned codebases before production deployment.
- **Composition:**
  - Two pinned real repositories (e.g., an Express API service and a Next.js web application).
  - 10 reproducible bug-fix and feature-addition tasks with automated test suites.
  - **Release Gate Criterion:** 100% of tasks must achieve automated verification pass with zero human interventions.

---

## 3. Standard Verification Commands

```bash
# 1. Run all unit and fixture assertions (Fast pre-commit check)
node scripts/test-gateway-fixtures.mjs
node scripts/test-harness-fixtures.mjs
node scripts/test-h2-inference.mjs

# 2. Run TypeScript strict type verification
npm run typecheck

# 3. Run ESLint code quality checks
npm run lint

# 4. Run Playwright end-to-end integration tests
npm run test:e2e
```
