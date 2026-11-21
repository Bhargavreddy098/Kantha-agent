# Safe Backend Cleanup & Restructuring Plan

**Status:** READY FOR OPERATOR REVIEW  
**Date:** 2026-11-21  
**Auditor:** Principal TypeScript Architect, Backend Engineer & AI Agent Runtime Architect  

---

## 1. Migration Strategy & Safety Rules

To prevent regressions during restructuring:
1. **Zero Disruption to Active Features:** All changes must preserve existing Gateway contracts, test suites, and frontend capabilities.
2. **One Atomic Step per Session:** Each step is defined as an independent, testable task.
3. **Continuous Verification:** Every task must pass `scripts/test-gateway-routes.mjs`, `scripts/test-gateway-fixtures.mjs`, and `scripts/test-harness-fixtures.mjs`.

---

## 2. Phased Migration Roadmap

```
┌─────────────────────────────────────────────────────────────┐
│ Task 1: Remove Misleading /v1 Proxy Endpoints (Dead Code)   │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│ Task 2: Move Test Fixtures & Assertions out of src/lib/     │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│ Task 3: Decouple Browser Clients & Client IndexedDB Store    │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│ Task 4: Consolidate Orgo Desktop Automation into Integrations│
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│ Task 5: Eliminate Run Cancellation Duplication              │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Atomic Task Specifications

### Task 1: Remove Dead / Misleading `/api/v1/*` Endpoints
* **Source Paths:**
  * `src/app/api/v1/chat/completions/route.ts`
  * `src/app/api/v1/models/route.ts`
* **Current Purpose:** Faux OpenAI compatibility routes that merely re-export internal AI SDK routes.
* **Evidence:**
  * `src/app/api/v1/chat/completions/route.ts` line 5 explicitly acknowledges: `// This compatibility route serves the same AI SDK UI-message protocol as /api/chat`.
  * Zero internal frontend components call `/api/v1/*`.
* **Proposed Action:** Remove both route files and remove the `src/app/api/v1/` directory.
* **Risk Level:** Very Low.
* **Dependencies:** None.
* **Verification Requirements:**
  ```bash
  npm run build
  node --test scripts/test-gateway-routes.mjs
  ```
* **Rollback Strategy:** `git checkout HEAD -- src/app/api/v1/`.

---

### Task 2: Relocate Test Fixtures & Assertions to `tests/fixtures/`
* **Source Paths:**
  * `src/lib/gateway/fixtures/` (all 5 files)
  * `src/lib/harness/verify-fixtures.ts`
  * `src/lib/harness/verify-inference.ts`
* **Current Purpose:** Test mock data and assertion suites bundled inside production `src/lib/`.
* **Evidence:** Only imported by `scripts/test-gateway-fixtures.mjs`, `scripts/test-harness-fixtures.mjs`, and `scripts/test-h2-inference.mjs`. No production runtime code imports them.
* **Proposed Action:**
  1. Move `src/lib/gateway/fixtures/` to `tests/fixtures/gateway/`.
  2. Move `src/lib/harness/verify-fixtures.ts` to `tests/fixtures/harness/verify-fixtures.ts`.
  3. Move `src/lib/harness/verify-inference.ts` to `tests/fixtures/harness/verify-inference.ts`.
  4. Update import specifiers in `scripts/*.mjs`.
* **Risk Level:** Low.
* **Dependencies:** Task 1.
* **Verification Requirements:**
  ```bash
  node scripts/test-gateway-fixtures.mjs
  node scripts/test-harness-fixtures.mjs
  node scripts/test-h2-inference.mjs
  ```
* **Rollback Strategy:** Revert path changes in `scripts/` and git restore fixture directories.

---

### Task 3: Decouple Browser Client SDK & IndexedDB Store
* **Source Paths:**
  * `src/lib/harness/client.ts`
  * `src/lib/chat/store.ts`
  * `src/lib/chat/attachments.ts`
* **Current Purpose:** Browser fetch client and client IndexedDB persistence currently residing in core server/harness folders.
* **Evidence:**
  * `src/lib/harness/AGENTS.md` mandates zero coupling between Harness and browser APIs.
  * `src/lib/chat/store.ts` is explicitly marked `"use client"`.
* **Proposed Action:**
  1. Move `src/lib/harness/client.ts` to `src/lib/client/harness.ts`.
  2. Move `src/lib/chat/store.ts` to `src/lib/client/chat-store.ts`.
  3. Move `src/lib/chat/attachments.ts` to `src/lib/client/attachments.ts`.
  4. Update imports in `src/components/` and `src/hooks/`.
* **Risk Level:** Low.
* **Dependencies:** Tasks 1–2.
* **Verification Requirements:**
  ```bash
  npx tsc --noEmit
  npm run build
  ```
* **Rollback Strategy:** `git checkout HEAD -- src/lib/harness/client.ts src/lib/chat/`.

---

### Task 4: Consolidate Orgo Desktop Automation into `src/lib/integrations/`
* **Source Paths:**
  * `src/lib/harness/computer-agent.ts`
  * `src/lib/gateway/providers/orgo-computer.ts`
  * `src/lib/gateway/providers/computer-inference.ts`
  * `src/lib/gateway/server/computer-agent-service.ts`
  * `src/app/api/gateway/computer-agent/route.ts`
* **Current Purpose:** Desktop computer automation scattered across Gateway server, Gateway providers, and Harness root.
* **Evidence:** Violates the architectural isolation of external capability adapters specified in `SPEC-native-kantha-harness-architecture.md`.
* **Proposed Action:**
  1. Create `src/lib/integrations/computers/orgo/`.
  2. Consolidate Orgo REST client, prompt construction, and execution service under `src/lib/integrations/computers/orgo/`.
  3. Update `registry.ts` and `scripts/test-computer-agent.mjs`.
* **Risk Level:** Medium.
* **Dependencies:** Tasks 1–3.
* **Verification Requirements:**
  ```bash
  node --test scripts/test-computer-agent.mjs
  node --test scripts/test-gateway-routes.mjs
  ```
* **Rollback Strategy:** Git restore modified files.

---

### Task 5: Consolidate Run Cancellation Endpoint
* **Source Paths:**
  * `src/app/api/gateway/harness/runs/[id]/cancel/route.ts`
  * `src/app/api/gateway/runs/[id]/cancel/route.ts`
* **Current Purpose:** Duplicate endpoints for run cancellation.
* **Evidence:** Both routes invoke `runService.cancelRun` with identical behavior.
* **Proposed Action:** Update `src/lib/client/harness.ts` to invoke `/api/gateway/runs/[id]/cancel` directly and remove the duplicate harness cancel route.
* **Risk Level:** Low.
* **Dependencies:** Task 3.
* **Verification Requirements:**
  ```bash
  node --test scripts/test-gateway-routes.mjs
  ```
* **Rollback Strategy:** Git restore harness cancel route.

---

## 4. Next Recommended Action

The audit is complete. As this was an audit-only assignment, **no production files have been moved, renamed, or modified.**

When ready to begin refactoring, start with **Task 1: Remove Dead / Misleading `/api/v1/*` Endpoints** in a fresh coding session.
