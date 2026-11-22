# Custom Provider Model Discovery & Colon-Delimited Routing Design

**Author:** Antigravity Agent  
**Date:** 2026-11-22  
**Status:** In Review  
**Target Workspaces:** `apps/daemon`, `apps/web`

---

## 1. Intent & Problem Statement
When users configure custom OpenAI-compatible providers (such as Cent or OpenRouter), two key issues currently break usability and model selection:

1. **Truncation in Model Discovery**: In `apps/web/src/components/SettingsDialog.tsx`, discovered models were artificially limited with `discoveredModels.slice(0, 10)`. For providers like Cent (offering 49 models), models located past index 10 (such as `deepseek-v4-flash`, `qwen3.8-flash`, `glm-5.3-flash`, and `hy4-flash:free`) were hidden.
2. **Manual Model Input Friction**: The Settings UI forced users to manually type a single `Model ID *` and `Model Display Name`, saving only one model at a time.
3. **Colon-Delimited Model Routing Failure (`hy4-flash:free`)**: In `apps/daemon/src/services/providerRegistry.ts`, `getProviderForModel` used `requestedModel.split(":")` assuming the first token was always a provider ID. When a model ID contained a colon (like `hy4-flash:free`), it looked for a provider named `"hy4-flash"`, failed, and fell back to default OpenAI with dummy keys, causing immediate failure.
4. **Silent 7-Second Retry Delay on 429**: Vercel AI SDK defaulted to 3 retries with exponential backoff on HTTP 429, making rate-limited models hang for ~7 seconds before displaying an error.

---

## 2. Goals & Non-Goals

### Goals
- **Remove Manual Model ID & Display Name Inputs**: Eliminate manual model text fields in the custom provider form.
- **Full Model Discovery**: Fetch and display all discovered models without arbitrary truncation (`slice(0, 10)` removed).
- **Auto-Save Discovered Models**: Save all discovered models with the custom provider in `providers.json`.
- **Searchable Composer Model Selector**: Provide all discovered models in the composer model dropdown with real-time text filtering so picking any model from large lists (40+ models) is fast.
- **Robust Colon Resolution in Daemon**: Correct `getProviderForModel` to safely match known provider ID prefixes and preserve colon-delimited model names (`hy4-flash:free`).
- **Immediate Error Feedback**: Avoid long exponential backoff hangs on streaming requests.

### Non-Goals
- Altering built-in provider configurations (OpenAI, Claude, Ollama, Groq, DeepSeek).
- Modifying IndexedDB database schema for chat messages.

---

## 3. Approaches Considered

### Approach 1: Auto-Save All Discovered Models + Searchable Composer Dropdown (Selected)
- **Settings Form**: Remove manual Model ID and Model Display Name inputs. User enters Name, Base URL, API Key, and clicks **Discover Models**. All returned models are previewed and stored with the provider.
- **Composer Dropdown**: All discovered models appear under the provider header in the chat composer dropdown, complete with a quick search filter at the top.
- **Daemon Routing**: Match provider ID against known provider IDs first; if not prefixed, match full model ID against all registered provider models.
- **Trade-off**: Zero manual typing for the user; seamless model switching in chat.

### Approach 2: Multi-Select Toggle Chips in Settings
- User manually toggles which discovered models to save using chip checkboxes.
- **Trade-off**: Extra clicks in Settings to manage active models.

---

## 4. Detailed Component Changes

### 4.1 Daemon: `apps/daemon/src/services/providerRegistry.ts`
- **Prefix-Aware Routing in `getProviderForModel`**:
  ```ts
  const all = this.getAll();
  let matchedProvider: ProviderConfig | undefined;
  let targetModelId = requestedModel.trim();

  // 1. Check if model starts with a known providerId followed by a colon
  for (const p of all) {
    if (requestedModel.startsWith(`${p.id}:`)) {
      matchedProvider = p;
      targetModelId = requestedModel.slice(p.id.length + 1);
      return { provider: matchedProvider, modelId: targetModelId };
    }
  }

  // 2. Direct match across all providers (supports model IDs with colons like hy4-flash:free)
  for (const p of all) {
    const modelMatch = p.models.find((m) => m.id === targetModelId);
    if (modelMatch) {
      return { provider: p, modelId: targetModelId };
    }
  }
  ```
- **Upsert Multiple Discovered Models**: Support saving an array of discovered models in `upsertCustom()`.

### 4.2 Daemon: `apps/daemon/src/api/chat.ts`
- Configure `maxRetries: 0` in `streamText` so upstream HTTP 429 and 402 billing errors fail fast and stream the specific error message to the UI immediately instead of delaying 7 seconds on retries.

### 4.3 Web: `apps/web/src/components/SettingsDialog.tsx`
- Remove `modelId` and `modelName` state and text input fields.
- Remove `slice(0, 10)` on `discoveredModels`. Render a scrollable list of all discovered models showing ID and name.
- When saving, map `discoveredModels` to `provider.models`. If the user has not run discovery, provide a single custom model input or sensible fallback.

### 4.4 Web: `apps/web/src/components/Composer.tsx`
- In the Astryx `DropdownMenu` model selector, add a compact search input at the top of the menu when models exceed 8 items.
- Filter model items in real time based on the query (e.g. typing "flash" or "free" shows only matching models).

---

## 5. Verification Plan
1. **Daemon Model Resolution**: Verify unit tests in `apps/daemon/src/services/__tests__/providerRegistry.test.ts` for colon-containing model IDs (`hy4-flash:free`, `provider_1:hy4-flash:free`).
2. **Typecheck Monorepo**: Run `tsc --noEmit` across both `apps/daemon` and `apps/web`.
3. **Live Streaming Verification**: Test live SSE stream with `hy4-flash:free` and verify instant response without delay.
