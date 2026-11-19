# Model inference and tool continuation

Proposed feature contract. Start with H0–H2 and release check A3 in the [implementation plan](../IMPLEMENTATION-PLAN.md).

## Ownership and contract

The gateway resolves the authorized connection, model, credentials, egress and durable usage. The harness owns logical steps and their conversation history. It calls a gateway-mediated inference interface with a scoped run and step, selected model, ordered messages, eligible tool definitions and cancellation signal.

A normalized response carries text deltas, complete tool calls with stable IDs, terminal state and permitted usage metadata. Argument fragments stay in the model stream buffer until the call is complete. The next request includes the correlated assistant tool calls and recorded tool results. Each physical provider attempt reserves usage before dispatch and reconciles once, including cancellation or unknown usage. Provider retries remain bounded by gateway policy.

## Build order and integration

1. Use a scripted provider to establish a full fixture exchange with text, a complete call, a matching tool result and a final response. Include a cancelled and malformed stream.
2. Trace the current [chat service](../../../src/lib/gateway/server/chat-service.ts), [model adapter](../../../src/lib/gateway/providers/language-model.ts), [egress](../../../src/lib/gateway/providers/egress.ts) and [usage service](../../../src/lib/gateway/server/usage-service.ts). Establish a gateway-mediated seam that preserves ordinary chat.
3. Qualify one actual gateway model with tool continuation and restart handling. If deployment needs a separate service endpoint, specify service authentication and wire conformance before use. Keep provider credentials within the gateway.
4. Publish progress through [Chat and events](CHAT-EVENTS.md). The [session runner](SESSIONS.md) decides whether a typed provider failure can terminate or continue under its pinned plan.

## Acceptance scenarios

- Send one logical step with a successful tool call. Verify the exact ID and result appear in the next provider request and that the final response projects to the same public run.
- Force budget refusal, pre-output transient failure, partial output and Stop. Assert zero dispatch when denied, distinct attempt IDs on permitted retry, no automatic repetition of visible output or effects, and one settlement per attempt.
- Terminate the worker while an attempt is outstanding. Recover an existing receipt or record unknown usage and surface a typed outcome under the gateway accounting contract.

Run the existing [chat stream tests](../../../scripts/test-chat-stream.mjs) for regression. Run provider contract fixtures and a real selected-model smoke as separate evidence. See the [pinned OpenCode provider and runner source map](../../gateway/OPENCODE-HARNESS.md#from-submission-to-model-and-tool-execution).
