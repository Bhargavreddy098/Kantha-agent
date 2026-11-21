# Dead Code & Restructuring Candidates Audit

**Status:** AUDIT COMPLETE  
**Date:** 2026-11-21  
**Auditor:** Principal TypeScript Architect, Backend Engineer & AI Agent Runtime Architect  

---

## 1. Dead Code Candidates (Evaluation for Removal)

Per the audit guidelines, modules are only marked as removal candidates when there is concrete evidence that they are obsolete, misleading, or completely orphaned.

### Candidate 1: `/api/v1/chat/completions` (`src/app/api/v1/chat/completions/route.ts`)
* **Current Purpose:** Proxies to `/api/chat/route.ts`.
* **Evidence:**
  ```typescript
  import { POST as chatPost } from '@/app/api/chat/route';
  export const maxDuration = 60;
  // This compatibility route serves the same AI SDK UI-message protocol as /api/chat.
  export const POST = chatPost;
  ```
  This route is marketed as OpenAI-compatible (`/v1/chat/completions`), but it actually returns Vercel AI SDK UI-message protocol stream chunks (`0:"..."\n`), which will break any standard OpenAI client (e.g., Python `openai`, LangChain, Curl).
* **Callers / Importers:** Zero internal frontend callers. No test in `scripts/` verifies standard OpenAI JSON compatibility.
* **Proposed Action:** Deprecate or REMOVE. If OpenAI compatibility is needed, implement an authentic OpenAI SSE transformation adapter; otherwise remove this route to avoid contract confusion.
* **Risk Level:** Very Low.
* **Rollback Strategy:** Revert file from git history if external API consumers are identified.

---

### Candidate 2: `/api/v1/models` (`src/app/api/v1/models/route.ts`)
* **Current Purpose:** Re-export of `/api/models/route.ts`.
* **Evidence:**
  ```typescript
  import { GET as modelsGet, POST as modelsPost } from '@/app/api/models/route';
  export const GET = modelsGet;
  export const POST = modelsPost;
  ```
* **Callers / Importers:** Zero callers in frontend (`chat-workspace.tsx` and `use-ai-provider.ts` both use `/api/chat/models`).
* **Proposed Action:** REMOVE in conjunction with Candidate 1.
* **Risk Level:** Very Low.
* **Rollback Strategy:** Revert file from git history.

---

### Candidate 3: `submitSessionRun` in `src/lib/gateway/server/chat-service.ts`
* **Current Purpose:** Starts an inference stream and immediately aborts it:
  ```typescript
  async submitSessionRun(raw: unknown, sessionId: string, ctx: RequestContext) {
    const started = await this.startRun(readChatInput(raw, ctx, sessionId), ctx);
    if (!started.replayed) {
      // This caller observes the journal. The independent stream consumer owns finalization.
      await started.response.body?.cancel().catch(() => undefined);
    }
    return { run: started.run, replayed: started.replayed };
  }
  ```
* **Evidence:** Called exclusively by `src/app/api/gateway/sessions/[id]/runs/route.ts`. It consumes gateway capacity, reserves an attempt, triggers an outbound inference request, and immediately aborts the response body without saving an assistant message.
* **Proposed Action:** REFACTOR / DEPRECATE. Real background task execution must be routed through the Native Harness (`HarnessService.submit`), not through an aborted chat stream.
* **Risk Level:** Low.
* **Rollback Strategy:** Retain until unified Harness-backed chat session runner is active.

---

## 2. Misplaced Files Requiring Move (Not Removal)

The following files are active and necessary, but violate subsystem boundaries by being placed in the wrong folder:

### 1. Test Assertions & Fixtures inside Production `src/lib/`
* `src/lib/gateway/fixtures/verify-fixtures.ts`
* `src/lib/gateway/fixtures/payloads.ts`
* `src/lib/gateway/fixtures/scenarios.ts`
* `src/lib/gateway/fixtures/seed-data.ts`
* `src/lib/harness/verify-fixtures.ts`
* `src/lib/harness/verify-inference.ts`
* **Evidence:** These files are only imported by scripts (`scripts/test-gateway-fixtures.mjs`, `scripts/test-harness-fixtures.mjs`, `scripts/test-h2-inference.mjs`). They contain test assertions and mock payloads bundled directly into the production source tree.
* **Proposed Action:** MOVE to `tests/fixtures/gateway/` and `tests/fixtures/harness/`.
* **Risk Level:** Low (requires updating path specifiers in `scripts/*.mjs`).

---

### 2. Browser HTTP Client inside Execution Engine
* `src/lib/harness/client.ts`
* **Evidence:** Implements browser fetch calls (`gatewayRequest`, `createHarnessSession`, `submitHarnessRun`) inside `src/lib/harness/`. Per `src/lib/harness/AGENTS.md`, the Harness subsystem must be completely decoupled from React and browser APIs.
* **Proposed Action:** MOVE to `src/lib/gateway/client.ts` or `src/lib/client/harness.ts`.
* **Risk Level:** Low.

---

### 3. Client IndexedDB Store & Attachments in Shared `lib/chat/`
* `src/lib/chat/store.ts` (marked `"use client"`)
* `src/lib/chat/attachments.ts` (browser file validation)
* **Evidence:** Bundled in `src/lib/chat/` alongside server-side worker queue modules (`document-queue.ts` which uses `node:worker_threads`). This mixes browser IndexedDB code with Node.js server threads.
* **Proposed Action:** Segregate client persistence into `src/lib/client/chat-store.ts` and server ingestion into `src/lib/gateway/server/upload/`.
* **Risk Level:** Low.

---

### 4. Orgo Cloud Computer Integration Scattered Across Gateway & Harness
* `src/lib/harness/computer-agent.ts`
* `src/lib/gateway/providers/orgo-computer.ts`
* `src/lib/gateway/providers/computer-inference.ts`
* `src/lib/gateway/server/computer-agent-service.ts`
* `src/app/api/gateway/computer-agent/route.ts`
* **Evidence:** Orgo is an external cloud desktop provider. Placing its REST client in `gateway/providers/` and its execution loop in `harness/computer-agent.ts` violates the architectural requirement that capability adapters remain provider-neutral and decoupled.
* **Proposed Action:** MOVE and encapsulate into `src/lib/integrations/computers/orgo/`.
* **Risk Level:** Medium. Requires updating `registry.ts` and `scripts/test-computer-agent.mjs`.
