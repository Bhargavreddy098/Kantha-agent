# Vercel AI SDK Integration & Universal Provider Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the Vercel AI SDK into the Kantha Bun daemon with a secure provider registry, custom endpoint configuration, in-composer model switching, and real reasoning streaming.

**Architecture:** Replace manual HTTP chunk parsing in the daemon with Vercel AI SDK (`ai@7.0.170`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/openai-compatible`) using `streamText()` and `result.fullStream`. Implement a daemon-side `ProviderRegistry` for built-in and user-defined custom endpoints with credential masking, and wire it to an Astryx in-composer model switcher and Settings management interface.

**Tech Stack:** Bun / Node, Vercel AI SDK (`ai@7.0.170`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/openai-compatible`), React 19, Vite, Astryx Design (`@astryxdesign/core`, `@astryxdesign/theme-neutral`), Dexie.js (`IndexedDB`), `node:test`.

**Spec:** [`docs/superpowers/specs/2026-11-22-vercel-ai-sdk-integration-design.md`](docs/superpowers/specs/2026-11-22-vercel-ai-sdk-integration-design.md)

---

## Global Constraints
- Strict preservation of the Swiss International Typographic Style using `@astryxdesign/core` and `@astryxdesign/theme-neutral` exclusively.
- Zero Tailwind CSS, zero shadcn/ui.
- Run Vercel AI SDK entirely inside the Bun daemon (`apps/daemon`). No Next.js or external edge proxies.
- Zero credential leakage: API keys and auth headers must remain on the daemon and never be sent to the browser or stored in plaintext IndexedDB.
- Maintain compatibility with the existing SSE event format (`{ content, reasoning }`, `[DONE]`) so current thinking panel and message rendering work seamlessly.
- Preserve existing Dexie conversation history without data loss.

---

## Review Focus
1. **Stream Cancellation & Leak Safety:** Ensure closing the browser tab or clicking Stop immediately aborts `streamText()` via `AbortController` and releases resources.
2. **Provider Fail-Closed Behavior:** Validate that missing API keys or unreachable endpoints return clean 4xx/5xx JSON errors rather than uncaught daemon crashes.
3. **Multimodal Integrity:** Ensure image attachments (`image_url` data URLs) and extracted document texts are correctly converted into AI SDK `CoreMessage` structures.
4. **Reasoning Stream Separation:** Verify that reasoning tokens are routed exclusively to `reasoning` deltas and final answers to `content` deltas.
5. **Dynamic Model Switching:** Verify switching models from the chat composer immediately routes the next message to the newly selected provider without page reloads.

---

## Tasks

### Task 1: Update Daemon Dependencies & Provider Registry
**Files:**
- `apps/daemon/package.json`
- `apps/daemon/src/services/providerRegistry.ts`
- `apps/daemon/src/services/__tests__/providerRegistry.test.ts`

- [ ] Add `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/openai-compatible` to `apps/daemon/package.json` and set `"ai": "^7.0.170"`.
- [ ] Implement `ProviderRegistry` in `apps/daemon/src/services/providerRegistry.ts`:
  - Built-in providers: OpenAI, Anthropic, Ollama, Groq, DeepSeek, OpenRouter.
  - Persistent storage of custom providers in `${dataDir}/providers.json` with safe fallback defaults.
  - Credential masking method `getSanitizedProviders()` hiding secrets from client responses.
  - CRUD methods: `getAll()`, `getById(id)`, `upsertCustom(provider)`, `deleteCustom(id)`, `setDefaultModel(modelId)`, `getDefaultModel()`.
  - Testing & Discovery: `testConnection(providerConfig)`, `discoverModels(providerConfig)`.
- [ ] Write unit tests in `apps/daemon/src/services/__tests__/providerRegistry.test.ts` covering CRUD operations, default model persistence, credential masking, and connection testing.
- [ ] Verify: `npx tsx --test apps/daemon/src/services/__tests__/providerRegistry.test.ts`.

---

### Task 2: Implement Vercel AI SDK Streaming Adapter in Daemon
**Files:**
- `apps/daemon/src/api/chat.ts`
- `apps/daemon/src/api/__tests__/chat.test.ts`

- [ ] Refactor `apps/daemon/src/api/chat.ts` to use Vercel AI SDK:
  - Import `streamText` from `ai`, `createOpenAI` from `@ai-sdk/openai`, `createAnthropic` from `@ai-sdk/anthropic`, and `createOpenAICompatible` from `@ai-sdk/openai-compatible`.
  - Implement `createLanguageModel(providerConfig, modelId)` factory resolving the correct adapter.
  - Convert `ChatMessagePayload[]` into AI SDK `CoreMessage[]` supporting system messages, user messages with text & base64 images, and assistant messages.
  - Enforce 20-message sliding window and 30k document character truncation.
  - Execute `streamText()` with `abortSignal` wired to HTTP request close.
  - Stream `fullStream` parts: emit `{ content: part.textDelta, reasoning: "" }` on `text-delta`, `{ content: "", reasoning: part.textDelta }` on `reasoning`, and `[DONE]` on finish.
- [ ] Update unit tests in `apps/daemon/src/api/__tests__/chat.test.ts` to verify message sanitization, payload transformation, and mock stream execution.
- [ ] Verify: `npx tsx --test apps/daemon/src/api/__tests__/chat.test.ts`.

---

### Task 3: Expose Provider Management REST Endpoints in Daemon Router
**Files:**
- `apps/daemon/src/api/router.ts`

- [ ] Register REST endpoints in `apps/daemon/src/api/router.ts`:
  - `GET /api/providers`: Returns sanitized provider list and default model.
  - `POST /api/providers`: Upserts a custom provider.
  - `DELETE /api/providers/:id`: Removes a custom provider.
  - `POST /api/providers/test`: Tests connection and measures latency.
  - `POST /api/providers/discover`: Discovers available models from provider endpoint.
  - `POST /api/providers/default`: Sets system default model.
- [ ] Wire `handleChatStreamRequest` to use `ProviderRegistry` for provider resolution.
- [ ] Verify: `npx tsx --test apps/daemon/src/api/auth/__tests__/security.test.ts`.

---

### Task 4: In-Composer Model Selector in Web Client
**Files:**
- `apps/web/src/components/Composer.tsx`
- `apps/web/src/components/ChatWorkspace.tsx`
- `apps/web/src/db/chatDb.ts`

- [ ] Add `model?: string` to `StoredConversation` in `apps/web/src/db/chatDb.ts`.
- [ ] In `apps/web/src/components/Composer.tsx`:
  - Add an Astryx model picker trigger to the composer's action toolbar with active model badge and chevron.
  - Render an Astryx Swiss-styled popover menu grouping models by provider (OpenAI, Anthropic, Ollama, Groq, DeepSeek, Custom).
  - Include an option "Configure Providers in Settings...".
  - Handle model selection change callback `onSelectModel(modelId)`.
- [ ] In `apps/web/src/components/ChatWorkspace.tsx`:
  - Pass configured providers and current model into `Composer`.
  - Persist selected model into the active conversation when switching.
  - Update top header status indicator dynamically.
- [ ] Verify: `pnpm --filter @kantha/web typecheck`.

---

### Task 5: Custom Provider Management & Connection Testing in Settings Dialog
**Files:**
- `apps/web/src/components/SettingsDialog.tsx`
- `apps/web/src/services/providerService.ts`

- [ ] Create `apps/web/src/services/providerService.ts` to fetch `/api/providers`, test connections, discover models, and save custom providers.
- [ ] Extend `SettingsDialog.tsx` "Models & Providers" tab:
  - Display configured providers with status indicators (`Configured`, `Local`, `Custom`).
  - Add "Add Custom Provider" button that reveals a custom provider form with fields: Name, Type, Base URL, API Key, Model ID, Model Display Name, Custom Headers, and Capability Checkboxes (Reasoning, Vision, Streaming).
  - Add "Test Connection & Discover Models" button with live testing feedback (latency, success/failure alert).
  - Allow editing and deleting custom providers.
  - Allow setting the default model.
- [ ] Verify: `pnpm --filter @kantha/web typecheck`.

---

### Task 6: Full Integration Verification & Build
**Files:** Monorepo-wide

- [ ] Run full monorepo typecheck: `pnpm -r typecheck`.
- [ ] Run production Vite build: `pnpm --filter @kantha/web build`.
- [ ] Run daemon and web test suites:
  - `npx tsx --test apps/daemon/src/services/__tests__/providerRegistry.test.ts`
  - `npx tsx --test apps/daemon/src/api/__tests__/chat.test.ts`
  - `npx tsx --test apps/daemon/src/api/__tests__/documents.test.ts`
  - `npx tsx --test apps/web/src/db/__tests__/chatDb.test.ts`
  - `npx tsx --test apps/daemon/src/api/auth/__tests__/security.test.ts`
- [ ] Commit all changes and verify clean working tree.
