import { validateEndpointUrl, type SsrfOptions } from "./ssrf";
import type { ProviderConfig } from "../types/provider";
import type { TimeoutConfig } from "./timeouts";

/**
 * Creates a hardened fetch implementation for a provider that enforces:
 * 1. Pre-flight SSRF and DNS check on target URL.
 * 2. Disabled auto-redirects (`redirect: "error"`) to defeat 3xx redirect SSRF bypasses.
 * 3. Request quirks injection (forcing encoding: "none", Anthropic cache_control headers on proxies, max_tokens rewrite).
 */
export function createQuirksFetch(provider: ProviderConfig, _timeouts?: TimeoutConfig): typeof fetch {
  const ssrfOpts: SsrfOptions = {
    isLocal: provider.isLocal,
    allowPrivateNetwork: provider.allowPrivateNetwork,
  };

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlString = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    // 1. SSRF pre-flight validation
    await validateEndpointUrl(urlString, ssrfOpts);

    const quirks = provider.compatibility;
    const modifiedInit: RequestInit = {
      ...(init || {}),
      redirect: "error", // Prevent 3xx redirect bypass to cloud metadata
    };

    const headers = new Headers(modifiedInit.headers || {});

    // 2. Body compression override: Force uncompressed plain JSON if requested
    if (quirks?.encoding === "none") {
      headers.delete("Content-Encoding");
      headers.set("Accept-Encoding", "identity");
    }

    // 3. Max completion tokens rewrite if proxy requires legacy max_tokens
    if (quirks?.maxTokensField === "max_tokens" && modifiedInit.body && typeof modifiedInit.body === "string") {
      try {
        const bodyJson = JSON.parse(modifiedInit.body);
        if ("max_completion_tokens" in bodyJson && !("max_tokens" in bodyJson)) {
          bodyJson.max_tokens = bodyJson.max_completion_tokens;
          delete bodyJson.max_completion_tokens;
          modifiedInit.body = JSON.stringify(bodyJson);
        }
      } catch {
        // Not JSON
      }
    }

    // 4. LiteLLM / Anthropic proxy prompt-cache injection
    if (quirks?.cacheFormat === "anthropic" && modifiedInit.body && typeof modifiedInit.body === "string") {
      try {
        const bodyJson = JSON.parse(modifiedInit.body);
        // Inject cache_control on last system block or messages
        if (Array.isArray(bodyJson.messages) && bodyJson.messages.length > 0) {
          const lastMsg = bodyJson.messages[bodyJson.messages.length - 1];
          if (lastMsg && typeof lastMsg === "object" && !lastMsg.cache_control) {
            lastMsg.cache_control = { type: "ephemeral" };
            modifiedInit.body = JSON.stringify(bodyJson);
          }
        }
      } catch {
        // Not JSON
      }
    }

    modifiedInit.headers = headers;

    return fetch(input, modifiedInit);
  };
}
