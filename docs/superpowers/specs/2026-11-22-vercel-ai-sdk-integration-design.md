# Vercel AI SDK Integration & Universal Provider Registry Design

**Author:** Antigravity Agent  
**Date:** 2026-11-22  
**Status:** Approved  
**Target Workspaces:** `apps/daemon`, `apps/web`

---

## 1. Executive Summary & Intent
Kantha currently uses a custom HTTP fetch-and-parse streaming loop in `apps/daemon/src/api/chat.ts` with manual regex splitting and buffer decoding. This design replaces that manual loop with the **Vercel AI SDK** (`ai@7.0.170`, `@ai-sdk/openai@4.0.115`, `@ai-sdk/anthropic@4.0.105`, and `@ai-sdk/openai-compatible@3.0.92`), transforming Kantha into a universal, provider-agnostic AI chat workspace.

The integration delivers:
1. **Universal Provider Registry**: Dynamic management of OpenAI, Anthropic, Ollama, Groq, DeepSeek, OpenRouter, and custom OpenAI-compatible endpoints with secure daemon-side credential persistence.
2. **Vercel AI SDK Streaming**: Robust token-by-token streaming via `streamText()` and `result.fullStream`, cleanly separating `text-delta` and `reasoning` chunks.
3. **Composer Model Selector**: Seamless in-composer model switching grouped by provider with Swiss International styling using Astryx components exclusively.
4. **Custom Provider Configuration**: A complete Settings interface to add, test, edit, and discover models for custom endpoints with connection testing and automatic model discovery.
5. **Zero Breaking Changes**: Preserves existing Dexie conversation history, Astryx design tokens, ADR-007 session auth, and SSE client protocols.

---

## 2. Core Architecture & Components

```
┌──────────────────────────────────────────────────────────┐
│                   apps/web (React 19)                    │
│                                                          │
│  ┌───────────────────────┐      ┌─────────────────────┐  │
│  │   Settings Dialog     │      │   Chat Composer     │  │
│  │ (Add/Test/Discover)   │      │  (Model Selector)   │  │
│  └──────────┬────────────┘      └──────────┬──────────┘  │
│             │                              │             │
│  IndexedDB (Dexie)                         │             │
│  - StoredConversations (with model ID)     │             │
│  - StoredMessages & Attachments            │             │
└─────────────┼──────────────────────────────┼─────────────┘
              │                              │
              │ REST / SSE                   │ SSE (/api/chat/stream)
              ▼                              ▼
┌──────────────────────────────────────────────────────────┐
│                  apps/daemon (Bun/Node)                  │
│                                                          │
│  ┌─────────────────────────┐    ┌─────────────────────┐  │
│  │    Provider Registry    │    │   Vercel AI SDK     │  │
│  │  - Built-in & Custom    │◄───┤   Streaming Engine  │  │
│  │  - Secure File Storage  │    │   - streamText()    │  │
│  │  - Credential Masking   │    │   - fullStream      │  │
│  └─────────────────────────┘    └──────────┬──────────┘  │
│                                            │             │
│                                            ▼             │
│   ┌──────────────────────────────────────────────────┐   │
│   │              Provider Adapters                   │   │
│   │  - @ai-sdk/openai (OpenAI)                       │   │
│   │  - @ai-sdk/anthropic (Claude)                    │   │
│   │  - @ai-sdk/openai-compatible (Ollama/Groq/Custom)│   │
│   └──────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

---

## 3. Daemon Services Design (`apps/daemon`)

### 3.1 Dependencies
Ensure `apps/daemon/package.json` explicitly lists:
- `ai`: `^7.0.170`
- `@ai-sdk/openai`: `^4.0.115`
- `@ai-sdk/anthropic`: `^4.0.105`
- `@ai-sdk/openai-compatible`: `^3.0.92`

### 3.2 Provider Registry (`apps/daemon/src/services/providerRegistry.ts`)
- **Storage Location:** `${dataDir}/providers.json` with restricted read/write permissions.
- **Data Structure:**
  ```typescript
  export interface ProviderConfig {
    id: string; // e.g., "openai", "groq", "custom_1"
    name: string; // e.g., "Groq Fast Inference"
    type: "openai" | "anthropic" | "openai_compatible" | "ollama";
    baseURL?: string;
    apiKey?: string;
    headers?: Record<string, string>;
    models: Array<{
      id: string;
      name: string;
      capabilities?: { reasoning?: boolean; vision?: boolean };
    }>;
    isCustom?: boolean;
    configured?: boolean;
  }
  ```
- **Built-in Defaults:**
  - `openai`: `gpt-4o`, `gpt-4o-mini`, `o3-mini` (reasoning: true)
  - `anthropic`: `claude-3-7-sonnet` (reasoning: true), `claude-3-5-sonnet`
  - `ollama`: `llama3.2`, `deepseek-r1` (reasoning: true), `qwen2.5-coder` (baseURL: `http://127.0.0.1:11434/v1`)
  - `groq`: `llama-3.3-70b-versatile`, `deepseek-r1-distill-llama-70b` (baseURL: `https://api.groq.com/openai/v1`)
  - `deepseek`: `deepseek-chat`, `deepseek-reasoner` (baseURL: `https://api.deepseek.com/v1`)
  - `openrouter`: `anthropic/claude-3.5-sonnet`, `deepseek/deepseek-r1` (baseURL: `https://openrouter.ai/api/v1`)
- **Security Rule:** When emitting provider lists to the client via `GET /api/providers`, the `apiKey` and authorization headers are masked or omitted (`hasApiKey: boolean`, `maskedApiKey: string`). Secrets are never transmitted in plaintext to the browser.

### 3.3 REST Endpoints
- `GET /api/providers`: Returns list of providers, models, and current default model.
- `POST /api/providers`: Upserts a custom provider configuration.
- `DELETE /api/providers/:id`: Deletes a custom provider.
- `POST /api/providers/test`: Tests a provider configuration by performing a low-overhead ping or single-token test, measuring latency.
- `POST /api/providers/discover`: Connects to `GET ${baseURL}/models` to discover supported model IDs.
- `POST /api/providers/default`: Saves user's default model preference.

### 3.4 AI SDK Streaming Engine (`apps/daemon/src/api/chat.ts`)
1. **Provider Resolution:** Resolves target model (format: `providerId:modelId` or raw `modelId`) and retrieves matching provider config from registry.
2. **Model Instantiation:**
   - OpenAI: `createOpenAI({ baseURL, apiKey, headers })(modelId)`
   - Anthropic: `createAnthropic({ baseURL, apiKey, headers })(modelId)`
   - OpenAI-compatible (Ollama, Groq, DeepSeek, OpenRouter, Custom): `createOpenAICompatible({ name, baseURL, apiKey, headers })(modelId)`
3. **Multimodal & Message Transformation:**
   - Translates `ChatMessagePayload[]` to AI SDK `CoreMessage[]` (`user`, `assistant`, `system`).
   - Supports text parts, image parts (base64 `image_url` data URLs), and document context.
   - Enforces sliding window (20 messages) and 30,000 character document truncation.
4. **Execution & Event Streaming:**
   - Calls `streamText({ model: languageModel, messages: coreMessages, abortSignal })`.
   - Reads `result.fullStream`:
     - `part.type === 'text-delta'` -> emits `data: {"content": part.textDelta, "reasoning": ""}\n\n`
     - `part.type === 'reasoning'` -> emits `data: {"content": "", "reasoning": part.textDelta}\n\n`
     - `part.type === 'error'` -> handles error gracefully and sends error SSE.
     - `part.type === 'finish'` -> emits `data: [DONE]\n\n`.
5. **Abort & Interruption Recovery:**
   - Listens to HTTP request close event and aborts the upstream stream immediately.

---

## 4. Frontend Design (`apps/web`)

### 4.1 Composer Model Selector (`apps/web/src/components/Composer.tsx`)
- Placed on the bottom-left toolbar of the floating composer.
- Built using Astryx components: subtle button with model badge, active dot indicator, and dropdown popover menu.
- Groups models by provider (OpenAI, Anthropic, Ollama, Groq, DeepSeek, Custom).
- Shows quick link: "Configure Providers...".
- Instantly updates active model without page refresh or conversation loss.

### 4.2 Settings Modal (`apps/web/src/components/SettingsDialog.tsx`)
- Extended "Models & Providers" tab:
  - List of active providers with status badges (`Configured`, `Local`, `Missing Key`).
  - "Add Custom Provider" button opens a Swiss modal:
    - Display Name, Provider Type, Base URL, API Key, Model ID, Model Display Name, Custom Headers.
    - Feature checkboxes: Streaming, Vision, Reasoning.
    - "Test Connection & Discover Models" button.
  - Custom providers display "Edit" and "Delete" actions.
  - Set Default Model picker.

### 4.3 Database Update (`apps/web/src/db/chatDb.ts`)
- Add `model?: string` to `StoredConversation`.
- Update conversation creation to associate the selected model.

---

## 5. Verification & Testing Strategy
1. **Unit Tests:**
   - `apps/daemon/src/services/__tests__/providerRegistry.test.ts`: built-in provider resolution, custom provider CRUD, secret masking, discover models parsing.
   - `apps/daemon/src/api/__tests__/chatAiSdk.test.ts`: verify `streamText` delta transformation, reasoning stream separation, multimodal handling, sliding window, and error handling.
2. **Integration Tests:**
   - Port-binding security test suite verification (`security.test.ts`).
   - Mocked provider endpoints testing OpenAI-compatible streaming.
3. **End-to-End Build Verification:**
   - `pnpm -r typecheck` across all packages.
   - `pnpm --filter @kantha/web build`.
