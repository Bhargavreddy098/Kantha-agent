# Custom Provider Model Discovery & Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver complete automatic model discovery without truncation, reliable provider routing supporting colon-delimited model IDs (`hy4-flash:free`), fail-fast streaming (`maxRetries: 0`), and a searchable Astryx model selector in the chat composer.

**Architecture:** The daemon (`apps/daemon`) manages provider models with structured `{ providerId, modelId }` resolution and prefix-safe fallback, failing closed instead of misrouting to OpenAI. The web frontend (`apps/web`) removes model count limits, auto-saves discovered models with manual fallback, and provides real-time search in the Astryx DropdownMenu model selector.

**Tech Stack:** Bun, React 19, TypeScript, Astryx Design (`@astryxdesign/core`), Vercel AI SDK (`ai`, `@ai-sdk/openai-compatible`), SSE, Node test runner.

**Spec:** [docs/superpowers/specs/2026-11-22-custom-provider-model-discovery-design.md](file:///C:/Users/bharg/OneDrive/Desktop/kantha-agent/docs/superpowers/specs/2026-11-22-custom-provider-model-discovery-design.md)

## Global Constraints
- Preserve existing React 19, Vite, Bun, Astryx, SSE, and Dexie architecture.
- Do not introduce Tailwind CSS or replace Astryx components with other UI libraries.
- Never silently fall back to OpenAI with dummy credentials when a model or provider is unresolved.
- Set `maxRetries: 0` on interactive streaming requests so 429/402 errors surface immediately.
- API credentials must remain protected on the daemon and never exposed in client payloads, logs, or browser storage.

## Review Focus
1. **Colon in Model ID**: Requesting `hy4-flash:free` or `openrouter/auto:free` must route to the matching custom provider rather than parsing `hy4-flash` as a provider ID.
2. **Discovered Models Without Truncation**: Providers with 40+ models (e.g. Cent with 49 models) must display and persist all models, not slice at 10.
3. **Duplicate Model IDs Across Providers**: When two providers offer the same model ID (e.g. `llama3.2`), structured selection or explicit provider prefix must select the user-chosen provider and never silently pick the first provider.
4. **Fail-Fast Streaming on 429/402**: Upstream rate limit or payment required errors must immediately terminate stream with descriptive error text without 7-second retry backoff.
5. **Searchable Model Selector**: Filtering by name or ID in the Composer DropdownMenu must work smoothly in real time without lag.

---

### Task 1: Daemon Structured Provider Resolution & Colon-Safe Model Routing

**Files:**
- Modify: `apps/daemon/src/services/providerRegistry.ts:257-295`
- Modify: `apps/daemon/src/api/chat.ts:200-245`
- Test: `apps/daemon/src/services/__tests__/providerRegistry.test.ts`

**Interfaces:**
- Consumes: `ProviderRegistry.getAll()`, `ChatMessagePayload`
- Produces: `getProviderForModel(requestedModel: string, explicitProviderId?: string): { provider: ProviderConfig; modelId: string } | null`

- [ ] **Step 1: Write failing tests in `providerRegistry.test.ts`**

Add tests covering:
1. Model IDs with colons without provider prefix: `hy4-flash:free` resolving to custom provider.
2. Model IDs with colons with explicit provider prefix: `custom_123:hy4-flash:free`.
3. Structured `{ providerId, modelId }` resolution where modelId contains colons.
4. Duplicate model IDs across two providers: explicit provider matches intended provider.
5. Unknown model: returns `null` instead of falling back to OpenAI.

```ts
it("should resolve colon-containing model IDs to the correct provider without splitting error", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kantha-reg-test-"));
  const registry = new ProviderRegistry({ dataDir: tmpDir });
  registry.upsertCustom({
    id: "cent_ai",
    name: "Cent AI",
    type: "openai_compatible",
    baseURL: "https://api.cent-ai.dev/v1",
    models: [{ id: "hy4-flash:free", name: "HY4 Flash Free" }],
  });

  const res1 = registry.getProviderForModel("hy4-flash:free");
  assert.ok(res1, "should resolve unprefixed colon model");
  assert.equal(res1.provider.id, "cent_ai");
  assert.equal(res1.modelId, "hy4-flash:free");

  const res2 = registry.getProviderForModel("hy4-flash:free", "cent_ai");
  assert.ok(res2, "should resolve structured providerId and modelId");
  assert.equal(res2.provider.id, "cent_ai");
  assert.equal(res2.modelId, "hy4-flash:free");

  const unknown = registry.getProviderForModel("completely-unknown-model");
  assert.equal(unknown, null, "unknown model must return null and not fallback to OpenAI");

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test apps/daemon/src/services/__tests__/providerRegistry.test.ts`
Expected: FAIL due to `getProviderForModel` splitting on colon and falling back to OpenAI.

- [ ] **Step 3: Implement prefix-aware `getProviderForModel` in `providerRegistry.ts`**

Update `getProviderForModel(requestedModel: string, explicitProviderId?: string)`:
1. If `explicitProviderId`: lookup `all.find(p => p.id === explicitProviderId)`. If found, return `{ provider: match, modelId: requestedModel.trim() }`.
2. Check if `requestedModel` starts with any known provider ID:
   ```ts
   for (const p of all) {
     if (requestedModel.startsWith(`${p.id}:`)) {
       return { provider: p, modelId: requestedModel.slice(p.id.length + 1) };
     }
   }
   ```
3. Search all providers for an exact match on `p.models.find(m => m.id === requestedModel.trim())`:
   - If multiple providers have the model and no explicit provider was given, throw or return the exact matching custom provider.
   - If one matches, return `{ provider: p, modelId: requestedModel.trim() }`.
4. Check built-in Ollama model shortcuts (`llama3.2`, etc.).
5. If no match is found, return `null`. **Do not fall back to OpenAI.**

- [ ] **Step 4: Update `handleChatStreamRequest` in `apps/daemon/src/api/chat.ts`**

1. Parse both `payload.providerId` and `payload.model`.
2. Pass both to `registry.getProviderForModel(requestedModel, payload.providerId)`.
3. If resolution is null, return `400 Bad Request` with `{ error: "Unknown model or provider. Please check your configured providers." }`.
4. In `streamText`, pass `maxRetries: 0`.

- [ ] **Step 5: Run tests and verify they pass**

Run: `bun test apps/daemon/src/services/__tests__/providerRegistry.test.ts`
Expected: PASS (all tests green).

- [ ] **Step 6: Commit**

```bash
git add apps/daemon/src/services/providerRegistry.ts apps/daemon/src/api/chat.ts apps/daemon/src/services/__tests__/providerRegistry.test.ts
git commit -m "fix(daemon): structured provider resolution, colon-safe model routing, and fail-fast streaming"
```

---

### Task 2: Multi-Model Discovery & Persistence in ProviderRegistry

**Files:**
- Modify: `apps/daemon/src/services/providerRegistry.ts:297-350, 399-452`
- Test: `apps/daemon/src/services/__tests__/providerRegistry.test.ts`

**Interfaces:**
- Consumes: Upstream `/models` JSON response (`data`, `models`, or raw array)
- Produces: `discoverModels(config)` returning all models, and `upsertCustom(providerInput)` storing full model array.

- [ ] **Step 1: Write failing tests in `providerRegistry.test.ts`**

```ts
it("should persist and deduplicate multiple discovered models in custom provider", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kantha-reg-test-"));
  const registry = new ProviderRegistry({ dataDir: tmpDir });

  const models = [
    { id: "model-a", name: "Model A" },
    { id: "model-b:free", name: "Model B Free" },
    { id: "model-a", name: "Model A Duplicate" },
  ];

  registry.upsertCustom({
    id: "custom_multi",
    name: "Multi Provider",
    type: "openai_compatible",
    baseURL: "https://api.example.com/v1",
    models,
  });

  const saved = registry.getAll().find((p) => p.id === "custom_multi");
  assert.ok(saved);
  assert.equal(saved.models.length, 2, "duplicate models should be deduplicated");
  assert.equal(saved.models[0].id, "model-a");
  assert.equal(saved.models[1].id, "model-b:free");

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run test to verify it fails or passes**

Run: `bun test apps/daemon/src/services/__tests__/providerRegistry.test.ts`

- [ ] **Step 3: Update `upsertCustom` and `discoverModels` in `providerRegistry.ts`**

1. In `upsertCustom`: Deduplicate `providerInput.models` by `id` using a Map:
   ```ts
   const uniqueModels = new Map<string, ProviderModel>();
   for (const m of providerInput.models || []) {
     if (m && m.id && !uniqueModels.has(m.id)) {
       uniqueModels.set(m.id, {
         id: m.id.trim(),
         name: (m.name || m.id).trim(),
         capabilities: m.capabilities || { streaming: true },
       });
     }
   }
   ```
2. In `discoverModels`: Ensure pagination/list extraction handles any standard OpenAI-compatible format without limit.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test apps/daemon/src/services/__tests__/providerRegistry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/daemon/src/services/providerRegistry.ts apps/daemon/src/services/__tests__/providerRegistry.test.ts
git commit -m "feat(daemon): support multi-model persistence and deduplication in ProviderRegistry"
```

---

### Task 3: Settings Dialog - Automatic Model Discovery & Manual Fallback

**Files:**
- Modify: `apps/web/src/components/SettingsDialog.tsx`
- Modify: `apps/web/src/services/providerService.ts`

**Interfaces:**
- Consumes: `providerService.discoverModels()`, `providerService.upsertCustomProvider()`
- Produces: UI for discovering all models without truncation, with optional manual model fallback.

- [ ] **Step 1: Update `SettingsDialog.tsx` state and form**

1. Remove `modelId` and `modelName` required states and mandatory inputs.
2. Remove `discoveredModels.slice(0, 10)` truncation:
   - Render all discovered models in a clean, scrollable container with total count header:
     `Discovered Models (${discoveredModels.length}):`
   - Each model tag shows its ID with reasoning/vision badges if detected.
3. Add optional collapsible section: "Add Model Manually" for endpoints that do not implement `/models`:
   - Inputs: Manual Model ID and Display Name.
   - "Add to List" button that appends to `discoveredModels`.
4. In `handleSaveCustomProvider`:
   - Validate that `providerName.trim()` and `baseURL.trim()` are non-empty.
   - If `discoveredModels.length === 0` and manual model was entered, use that model.
   - If no models were discovered and no manual model was entered, display prompt: "Please click 'Discover Models' or add a model manually before saving."
   - Send all discovered/entered models to `upsertCustomProvider`.
   - Call `onProvidersUpdated()` to sync composer immediately.

- [ ] **Step 2: Typecheck web package**

Run: `bun run --cwd apps/web build` or `tsc --noEmit --project apps/web/tsconfig.json`
Expected: PASS with 0 type errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/SettingsDialog.tsx apps/web/src/services/providerService.ts
git commit -m "feat(web): complete automatic model discovery without truncation and manual fallback"
```

---

### Task 4: Searchable Astryx DropdownMenu Model Selector in Composer

**Files:**
- Modify: `apps/web/src/components/Composer.tsx`
- Modify: `apps/web/src/components/ChatWorkspace.tsx`
- Modify: `apps/web/src/services/chatStreamService.ts`

**Interfaces:**
- Consumes: `providersData.providers`
- Produces: Searchable Astryx model picker passing structured `{ providerId, modelId }` to streaming endpoint.

- [ ] **Step 1: Implement search filter in `Composer.tsx`**

1. In `Composer.tsx`, add a search state `const [modelSearchQuery, setModelSearchQuery] = useState("");`.
2. When the DropdownMenu opens or renders:
   - If total models > 6, render a search input at the top of the menu using Astryx design tokens:
     ```tsx
     <div style={{ padding: "6px 8px", borderBottom: "1px solid var(--swiss-border)" }}>
       <input
         type="text"
         placeholder="Search models..."
         value={modelSearchQuery}
         onChange={(e) => setModelSearchQuery(e.target.value)}
         autoFocus
         style={{ ... }}
       />
     </div>
     ```
3. Filter models by `m.name.toLowerCase().includes(q)` or `m.id.toLowerCase().includes(q)`.
4. Group filtered models by provider name.
5. In `DropdownMenuItem`, highlight selected model and call `onSelectModel(fullId)`.

- [ ] **Step 2: Update `chatStreamService.ts` to pass structured identifiers**

1. Update `StreamChatOptions` to accept `providerId?: string; model?: string;`.
2. In `streamChatResponse`, if `model` is in format `providerId:modelId`, extract `providerId` and `model` to send both in the POST payload:
   ```ts
   body: JSON.stringify({
     messages: payloadMessages,
     model: resolvedModelId,
     providerId: resolvedProviderId,
   })
   ```

- [ ] **Step 3: Update `ChatWorkspace.tsx` provider synchronization**

1. Ensure `onProvidersUpdated` triggers `refreshProviders()` and updates state without full reload.
2. If currently selected model was updated or deleted, cleanly sync to the newly saved model.

- [ ] **Step 4: Typecheck web and daemon packages**

Run: `bun run --cwd apps/web build; tsc --noEmit --project apps/daemon/tsconfig.json`
Expected: PASS with 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/Composer.tsx apps/web/src/components/ChatWorkspace.tsx apps/web/src/services/chatStreamService.ts
git commit -m "feat(web): searchable model selector and structured provider stream dispatch"
```

---

### Task 5: End-to-End Regression Testing & Live Provider Verification

**Files:**
- Modify: `apps/daemon/src/api/__tests__/chat.test.ts`
- Modify: `apps/daemon/src/services/__tests__/providerRegistry.test.ts`
- Target: `.kantha-data/providers.json` (live Cent provider verification)

**Interfaces:**
- Proves: All 14 user requirements met with automated test evidence and live verification.

- [ ] **Step 1: Add regression tests for fail-fast streaming (`maxRetries: 0`) and 429/402 handling**

In `chat.test.ts`, verify that `createLanguageModel` and `streamText` configuration disables retries and handles errors without uncaught crashes.

- [ ] **Step 2: Run all daemon and web automated tests**

Run: `bun test apps/daemon/src/services/__tests__/providerRegistry.test.ts; bun test apps/daemon/src/api/__tests__/chat.test.ts; bun test apps/web/src/db/__tests__/chatDb.test.ts`
Expected: ALL PASS.

- [ ] **Step 3: Update `.kantha-data/providers.json` with all discovered models for Cent**

Persist the full discovered list (including `hy4-flash:free`, `deepseek-v4-flash`, etc.) for Cent so the live environment has all models.

- [ ] **Step 4: Execute live streaming verification against `hy4-flash:free`**

Run a live script with Bun against `http://localhost:4000/api/chat/stream` or direct handler with `model: "hy4-flash:free"`, verify:
1. Provider resolves to `Cent`.
2. Model resolves to `hy4-flash:free`.
3. Tokens stream immediately with reasoning.
4. Total latency is within ~2-3 seconds.

- [ ] **Step 5: Commit**

```bash
git add apps/daemon/src/api/__tests__/chat.test.ts apps/daemon/src/services/__tests__/providerRegistry.test.ts .kantha-data/providers.json
git commit -m "test: comprehensive regression tests and verified live custom provider models"
```
