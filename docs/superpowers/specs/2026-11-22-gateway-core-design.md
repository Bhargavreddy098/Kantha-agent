# Gateway Core Architecture Specification (@kantha/gateway)

**Status:** Approved Architecture Design  
**Date:** 2026-11-22  
**Owner:** Gateway Subsystem (`packages/gateway`, `apps/daemon`)  
**Scope:** Phase 1 Embedded Gateway Core & Phase 2 Localhost HTTP Facade Preparedness

---

## 1. Intent and Why

Kantha is an autonomous, local-first AI coding workbench and daemon. To deliver reliable code generation, planning, and tool execution, Kantha requires a unified, high-fidelity AI provider gateway modeled after OpenCode's local architecture.

### Key Drivers
- **Zero Intelligence Degradation:** Frontier paid models (such as Claude 3.7/3.5 Sonnet, GPT-4o/o3, Gemini 2.0/1.5 Pro) possess distinct native capabilities—such as thinking/reasoning blocks, effort levels, prompt-cache breakpoints, and tool-call schema formatting. Cross-protocol HTTP translation is lossy and strips these features. The Gateway uses native provider adapters that accept a unified internal canonical AST, transform it into native upstream wire payloads, and normalize upstream events into a single typed internal stream.
- **BYOK-Only Model (No Subscriptions):** Unlike commercial services (e.g., OpenCode Go), Kantha eliminates subscription tiers. Users bring their own API keys (BYOK) for paid frontier models or connect local/free engines (Ollama, vLLM).
- **Intelligence Tier & Capability Awareness:** Free and local models often fail in multi-step tool-use loops. The catalog explicitly documents model capabilities (tools, reasoning, promptCache, context limits, pricing) and assigns dynamic intelligence tiers based on capability rules, allowing Kantha's harness to route tasks intelligently (planning/coding to Tier 1, summaries/titles to Tier 3/4).
- **Transport Agnostic:** The core resides in an isolated workspace package (`packages/gateway` as `@kantha/gateway`), consumed directly in-process by `apps/daemon` (Phase 1), with clean extension points for a localhost-only HTTP proxy facade (`/inference/...`) in Phase 2.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
1. **Isolated Gateway Package:** Stand up `@kantha/gateway` (`packages/gateway`) built with Effect-TS (`effect`, `Context.Tag`).
2. **Pure Port/Adapter Boundaries:** Define `LedgerStore`, `VaultStore`, `ProviderStore`, `MasterKeyProvider`, and `CatalogCacheStore` as Effect `Context.Tag` interfaces inside `@kantha/gateway` with in-memory test layers, completely eliminating filesystem or database coupling inside the package.
3. **Native Provider Adapters & Quirks Engine:** Native protocol drivers preserving thinking blocks, prompt caching, and tool calls. Standard parameters map through `@ai-sdk/*` options, while gateway-level quirks (e.g. Anthropic cache control on proxies, custom `reasoningField`, `maxTokensField`, and `encoding: "none"`) execute via a custom fetch request/SSE stream transform layer or native HTTP driver.
4. **Encrypted BYOK Vault with AAD:** AES-256-GCM encryption with fresh 96-bit IV per secret, formatted as `v1:<iv>:<tag>:<ciphertext>`, with provider/secret ID bound as Additional Authenticated Data (AAD). Master key loaded via `MasterKeyProvider` (restricted keyfile / OS keychain / DPAPI on Windows / env var `KANTHA_GATEWAY_MASTER_KEY`).
5. **Hardened SSRF Guardrails:** Reject HTTP redirects (`redirect: "error"`), resolve all DNS addresses via `dns.lookup(hostname, { all: true })`, validate IPv4 and IPv6 private/link-local/IPv4-mapped ranges, and block cloud metadata (`169.254.169.254`) as well as `0.0.0.0/8` and `::`. Permit loopback for `isLocal: true` and support explicit opt-in `allowPrivateNetwork: true` for LAN GPU servers (e.g. `192.168.x.x`).
6. **First-Class Cancellation & Non-Blocking Finalizers:** Propagate Effect fiber interruption directly to `AbortSignal` on upstream requests. Wrap ledger settlements in non-blocking finalizers with timeouts and error swallowing so database locks never hang turn cancellation.
7. **Offline-Resilient Catalog:** Commit a full downloaded snapshot from `https://models.dev/catalog.json` as the offline baseline, with background catalog sync targeting `https://models.dev/catalog.json` and `https://models.dev/api.json`.
8. **Granular Token & Cost Accounting:** Authoritative tracking in `LedgerStore` with pre-attempt `checkBudget(sessionId)` and post-turn settlement splitting `cacheWrite5m` vs. `cacheWrite1h`, capturing `reasoningTokens`, and recording `estimated: boolean` and execution `status` (`"completed" | "interrupted" | "error"`).
9. **Phase 2 Pass-Through Extension Point:** Design `passthrough(family, rawRequest)` to allow future localhost HTTP proxy endpoints to reuse Vault, SSRF, and Ledger without double-translating through the internal canonical AST.

### Non-Goals
- **No Cross-Protocol HTTP Translation:** Kantha will not translate Anthropic Messages into OpenAI Chat format or vice versa.
- **No Subscriptions or Paid Seats:** No billing gateways, subscription verification, or hosted proxy billing.
- **No Remote Multi-Tenant Gateway in Phase 1:** Phase 1 runs embedded in the daemon process; Phase 2 proxy binds strictly to `127.0.0.1`.

### Anti-Goals
- **No Silent Tool Failure:** Never route multi-file coding or tool-heavy runs to models flagged as unreliable for tool-use without explicit warning.
- **No In-Memory Key Leakage:** Never pass decrypted keys to sandboxes, logs, journals, checkpoints, or telemetry.
- **No Zombie Requests:** Never leave an upstream HTTP request open when a user stops generation or disconnects.

---

## 3. Approaches Considered

| Approach | Description | Trade-offs | Decision |
|---|---|---|---|
| **Approach 1: Decoupled Package (`packages/gateway`)** | Standalone monorepo package exposing `GatewayService` as an Effect service with storage ports (`LedgerStore`, `VaultStore`, `ProviderStore`, `MasterKeyProvider`, `CatalogCacheStore`). | Clean architecture; testable in isolation; zero HTTP coupling; ready for Phase 2 HTTP facade. Slightly more setup. | **SELECTED** |
| **Approach 2: Daemon-Colocated (`apps/daemon/src/gateway`)** | Modular gateway internal to the daemon process. | Fast initial setup, but couples model logic to daemon server and prevents CLI or test harnesses from reusing the gateway. | **REJECTED** |
| **Approach 3: SDK Middleware Hooks Only** | Custom callbacks on top of existing `ProviderRegistry`. | Fragile; cannot support Anthropic prompt-cache breakpoints, custom reasoning fields, or offline catalog sync cleanly. | **REJECTED** |

---

## 4. Architecture & Module Design

```
packages/gateway/
├── src/
│   ├── index.ts                     # Public API exports
│   ├── types/
│   │   ├── request.ts               # Canonical AST: KanthaMessage, KanthaTool, InferenceRequest
│   │   ├── catalog.ts               # ModelDefinition, ModelTier, Capabilities, Pricing
│   │   ├── provider.ts              # ProviderConfig, ProviderType, CustomSettings
│   │   ├── stream.ts                # StreamDelta, StreamEvent, ReasoningBlock
│   │   └── usage.ts                 # TokenUsage, CostBreakdown, LedgerEntry
│   ├── service.ts                   # GatewayService interface & Effect Tag
│   ├── ports/
│   │   ├── vault.ts                 # VaultStore Context.Tag interface & InMemoryLayer
│   │   ├── master-key.ts            # MasterKeyProvider Context.Tag interface
│   │   ├── providers.ts             # ProviderStore Context.Tag interface & InMemoryLayer
│   │   ├── ledger.ts                # LedgerStore Context.Tag interface (with checkBudget) & InMemoryLayer
│   │   └── cache.ts                 # CatalogCacheStore Context.Tag interface & InMemoryLayer
│   ├── catalog/
│   │   ├── service.ts               # CatalogService (models.dev sync + cache)
│   │   ├── snapshot.json            # Downloaded complete catalog.json snapshot
│   │   └── tiers.ts                 # Capability & price-driven tier resolution logic
│   ├── vault/
│   │   ├── cipher.ts                # AES-256-GCM cipher with AAD (v1:iv:tag:ciphertext)
│   │   └── service.ts               # VaultService (encrypt/decrypt/resolve)
│   ├── ledger/
│   │   └── calculator.ts            # Token cost calculator based on catalog pricing
│   ├── compat/
│   │   ├── ssrf.ts                  # SSRF validator (all-record DNS check, private IP block, redirect: error)
│   │   ├── quirks.ts                # Compatibility engine (cacheFormat, reasoningField, etc.)
│   │   ├── timeouts.ts              # 3-timer model: headerTimeout, chunkTimeout, totalTimeout
│   │   └── fetch-wrapper.ts         # Custom fetch transform for quirks & SSRF pre-flight
│   └── adapters/
│       ├── base.ts                  # Adapter contract & stream normalizer
│       ├── openai.ts                # OpenAI Responses & Chat completions adapter
│       ├── anthropic.ts             # Anthropic Messages adapter (prompt caching & thinking signatures)
│       ├── gemini.ts                # Google Gemini generateContent adapter (multi-result & toolName)
│       ├── ollama.ts                # Local Ollama discovery & completion adapter
│       └── compatible.ts            # OpenAI/Anthropic-compatible endpoint adapter (with quirks transform)
```

---

## 5. Detailed Subsystem Specifications

### 5.1 Request Modeling: Canonical Internal AST & Multi-Turn Reasoning Support

`InferenceRequest` requires explicit provider disambiguation, supports multiple/interleaved reasoning blocks (including redacted thinking), and models multi-tool results cleanly:

```typescript
export interface InferenceRequest {
  readonly providerId: string;           // Disambiguates provider (e.g. "anthropic", "openrouter", "bedrock")
  readonly modelId: string;              // Model ID (e.g. "claude-3-7-sonnet")
  readonly variant?: string;             // Optional variant (e.g. "high", "fast")
  readonly messages: KanthaMessage[];
  readonly tools?: KanthaTool[];
  readonly options?: {
    readonly temperature?: number;
    readonly maxTokens?: number;
    readonly reasoningEffort?: "low" | "medium" | "high";
    readonly cacheBreakpoints?: boolean;
  };
  readonly attribution?: {
    readonly sessionId?: string;
    readonly turnId?: string;
  };
}

export interface KanthaReasoningBlock {
  readonly type: "thinking" | "redacted_thinking";
  readonly text?: string;
  readonly data?: string;                             // Base64 encrypted block for redacted items
  readonly signature?: string;                        // Cryptographic signature required by Anthropic
  readonly providerMetadata?: Record<string, unknown>; // Encrypted reasoning item payload/IDs for OpenAI
}

export interface KanthaToolCall {
  readonly id: string;
  readonly name: string;
  readonly arguments: Record<string, unknown>;
}

export interface KanthaToolResult {
  readonly callId: string;
  readonly toolName: string;                          // Required by Gemini functionResponse
  readonly content: unknown;
  readonly isError?: boolean;
}

export interface KanthaMessage {
  readonly role: "user" | "assistant" | "system" | "tool";
  readonly content: string | KanthaContentPart[];
  readonly reasonings?: KanthaReasoningBlock[];       // Ordered array preserving multiple/interleaved reasoning blocks
  readonly toolCalls?: KanthaToolCall[];
  readonly toolResults?: KanthaToolResult[];         // Multi-tool results with toolName
}
```

- **Multi-Turn Round-Trip:** When the assistant emits thinking blocks, native adapters capture both `text` and opaque `signature` / `providerMetadata`. On subsequent tool-result turns, the adapter passes these back verbatim to Anthropic or OpenAI, preventing HTTP 400 rejection.
- **Multi-Tool Results:** `toolResults` models parallel tool completions and provides `toolName`, ensuring both Gemini `functionResponse` and OpenAI `tool` messages format correctly.

---

### 5.2 Pure Port/Adapter Boundaries & Storage Contracts

`@kantha/gateway` defines storage contracts strictly using Effect `Context.Tag`:

```typescript
// packages/gateway/src/ports/master-key.ts
export interface MasterKeyProvider {
  readonly getMasterKey: () => Effect.Effect<Buffer, VaultError>;
}
export const MasterKeyProvider = Context.GenericTag<MasterKeyProvider>("@kantha/gateway/MasterKeyProvider");

// packages/gateway/src/ports/vault.ts
export interface VaultStore {
  readonly getSecret: (key: string) => Effect.Effect<string | null, VaultError>;
  readonly setSecret: (key: string, encryptedValue: string) => Effect.Effect<void, VaultError>;
  readonly deleteSecret: (key: string) => Effect.Effect<void, VaultError>;
  readonly listKeys: () => Effect.Effect<string[], VaultError>;
}
export const VaultStore = Context.GenericTag<VaultStore>("@kantha/gateway/VaultStore");

// packages/gateway/src/ports/providers.ts
export interface ProviderStore {
  readonly getProvider: (providerId: string) => Effect.Effect<ProviderConfig | null, ProviderError>;
  readonly listProviders: () => Effect.Effect<ProviderConfig[], ProviderError>;
  readonly saveProvider: (provider: ProviderConfig) => Effect.Effect<void, ProviderError>;
  readonly deleteProvider: (providerId: string) => Effect.Effect<void, ProviderError>;
}
export const ProviderStore = Context.GenericTag<ProviderStore>("@kantha/gateway/ProviderStore");

// packages/gateway/src/ports/ledger.ts
export interface LedgerStore {
  readonly checkBudget: (sessionId: string) => Effect.Effect<{ allowed: boolean; remainingUsd?: number }, LedgerError>;
  readonly recordTurnUsage: (entry: LedgerEntry) => Effect.Effect<void, LedgerError>;
  readonly getSessionUsage: (sessionId: string) => Effect.Effect<SessionUsageSummary, LedgerError>;
}
export const LedgerStore = Context.GenericTag<LedgerStore>("@kantha/gateway/LedgerStore");

// packages/gateway/src/ports/cache.ts
export interface CatalogCacheStore {
  readonly getCachedCatalog: () => Effect.Effect<string | null, CatalogError>;
  readonly setCachedCatalog: (rawJson: string) => Effect.Effect<void, CatalogError>;
}
export const CatalogCacheStore = Context.GenericTag<CatalogCacheStore>("@kantha/gateway/CatalogCacheStore");
```

- **Zero Filesystem Coupling:** All file reading (`gateway.key`, `catalog_cache.json`, `providers.json`) is implemented in `apps/daemon`. `@kantha/gateway` ships in-memory layers for every port for 100% deterministic, zero-disk unit testing.
- **Windows ACLs & Key Security:** In `apps/daemon`, the `MasterKeyProvider` implements POSIX `0600` permissions and Windows restricted ACLs (via Node filesystem APIs / OS DPAPI).
- **Ciphertext AAD:** `vault/cipher.ts` formats encrypted secrets as `v1:<iv>:<tag>:<ciphertext>` (AES-256-GCM with fresh 96-bit IV) and passes the secret key ID / provider ID as Additional Authenticated Data (AAD) to prevent ciphertext swapping between provider slots.

---

### 5.3 SDK vs. Compat/Quirks Execution Boundary

1. **Standard Transport:** Adapters use `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, and `@ai-sdk/openai-compatible`.
2. **Quirks Interceptor Layer (`compat/fetch-wrapper.ts`):** A custom fetch wrapper sits beneath `@ai-sdk/*` to handle gateway quirks that SDK options do not expose:
   - **LiteLLM / Proxy Cache Injection:** Automatically injects Anthropic-style `cache_control: { "type": "ephemeral" }` into system and tool definitions when `compatibility.cacheFormat === "anthropic"`.
   - **Reasoning Stream Parsing:** Intercepts SSE chunks on OpenAI-compatible proxies to extract custom `reasoningField` values (e.g. `reasoning_content`, `thinking`).
   - **Request Rewriting:** Rewrites `max_tokens` vs `max_completion_tokens` when `compatibility.maxTokensField === "max_tokens"`.
   - **Body Compression:** Enforces `encoding: "none"` to prevent gateways rejecting compressed bodies.

---

### 5.4 Hardened SSRF Guardrails

`compat/ssrf.ts` inspects target URLs before request dispatch:
1. **No Auto-Redirects:** `redirect: "error"` is enforced on all upstream fetches.
2. **All-Record DNS Resolution:** Uses `dns.lookup(hostname, { all: true })` and validates every returned A and AAAA record.
3. **IP Range Blocking:**
   - **Unspecified / Zero Network:** `0.0.0.0/8`, `::`.
   - **Cloud Metadata:** `169.254.169.254`.
   - **IPv4 Private/Link-Local:** `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `100.64.0.0/10`, `169.254.0.0/16`.
   - **IPv6 Private/Link-Local/Mapped:** `::1`, `fc00::/7`, `fe80::/10`, `::ffff:0:0/96`.
4. **Local & LAN Exceptions:**
   - Loopback (`127.0.0.1`, `localhost`, `::1`) is permitted when `provider.isLocal === true` (e.g. Ollama/vLLM on host).
   - Private RFC 1918 IPs are permitted **only** when `provider.allowPrivateNetwork === true` (explicit opt-in for home lab / LAN GPU servers).

---

### 5.5 Three-Timer Model & Non-Blocking Finalizers

1. **Three-Timer Model (`compat/timeouts.ts`):**
   - `headerTimeout` (default: 600,000 ms / 10 min): Time from request send until response headers/status arrive.
   - `chunkTimeout` (default: 900,000 ms / 15 min): Max idle gap between streamed SSE chunks (critical for long-thinking models like o3 or Claude 3.7 Thinking).
   - `totalTimeout` (optional): Bounding limit on the entire turn from start to finish.
2. **Non-Blocking Cancellation Finalizer:**
   - When a turn is interrupted, fiber finalization aborts upstream HTTP requests via `AbortController`.
   - `LedgerStore.recordTurnUsage` is executed inside `Effect.addFinalizer` wrapped with `Effect.timeout(Duration.seconds(2))` and `Effect.catchAll` so a locked SQLite database never hangs turn cancellation.

---

### 5.6 Capability-Driven Catalog & Dynamic Tiering Precedence

1. **Catalog Sources:**
   - Bundled snapshot: Includes a downloaded complete snapshot from `https://models.dev/catalog.json` committed to `src/catalog/snapshot.json`.
   - Remote sync: Queries `https://models.dev/catalog.json` and `https://models.dev/api.json` with exponential backoff.
2. **Dynamic Tier Derivation Order (`catalog/tiers.ts`):**
   - **Step 1: Check Tier 4 (Free / Local / Small / No Tools):** If `cost.input === 0` OR `capabilities.tools !== true` OR `isLocal === true` without verified benchmark override -> **Tier 4**.
   - **Step 2: Check Tier 3 (Utility / Fast / Cheap):** If `cost.input < 0.50` (under $0.50 per 1M input tokens, e.g. Flash, Haiku, GPT-4o-mini, DeepSeek V3) -> **Tier 3**.
   - **Step 3: Check Tier 1 (Frontier BYOK):** If `capabilities.tools === true` AND `capabilities.reasoning.supported === true` AND (`cost.input >= 2.00` OR explicit catalog benchmark metadata) -> **Tier 1**.
   - **Step 4: Default to Tier 2 (General Purpose BYOK):** Models with tool capabilities and standard pricing not meeting Tier 1 criteria -> **Tier 2**.
   - **Overrides:** User explicit `tier` setting in `ProviderConfig` overrides automatic tier derivation.
3. **Granular Usage Ledger (`types/usage.ts`):**
   ```typescript
   export interface LedgerEntry {
     readonly id: string;
     readonly sessionId: string;
     readonly turnId?: string;
     readonly providerId: string;
     readonly modelId: string;
     readonly inputTokens: number;
     readonly outputTokens: number;
     readonly reasoningTokens: number;
     readonly cacheReadTokens: number;
     readonly cacheWrite5mTokens: number;
     readonly cacheWrite1hTokens: number;
     readonly costUsd: number;
     readonly estimated: boolean;
     readonly status: "completed" | "interrupted" | "error";
     readonly timestamp: number;
   }
   ```

---

### 5.7 Phase 2 Pass-Through Interface (No Lossy AST Round-Trip)

To prevent lossy double conversion for external clients calling Phase 2 proxy endpoints (`/inference/...`), `GatewayService` provides:

```typescript
export interface GatewayService {
  // Kantha internal harness interface (Canonical AST)
  readonly stream: (req: InferenceRequest) => Effect.Stream<StreamDelta, GatewayError>;
  readonly complete: (req: InferenceRequest) => Effect.Effect<InferenceResponse, GatewayError>;

  // Phase 2 Pass-Through interface (Preserves exact raw wire format)
  readonly passthrough: (
    family: "openai" | "anthropic" | "gemini",
    endpoint: string,
    rawHeaders: Record<string, string>,
    rawBody: unknown,
    attribution?: { sessionId?: string; turnId?: string }
  ) => Effect.Stream<Uint8Array, GatewayError>;

  readonly getCatalog: () => Effect.Effect<ModelCatalog, GatewayError>;
  readonly testConnection: (providerId: string) => Effect.Effect<ConnectionTestResult, GatewayError>;
}
```

---

## 6. What's Left to the Builder

The builder has full autonomy over:
1. Exact Drizzle table column names and index structures in `packages/db`.
2. Exact interval for catalog background refresh (default recommendation: every 24 hours).
3. Minor HTTP client retry backoff curves (e.g. exponential jitter with 3 retries for 429/503 errors).
