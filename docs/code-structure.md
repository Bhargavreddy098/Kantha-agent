# Source structure

This map describes the current repository. The [gateway contracts](gateway/CONTRACTS.md)
and [work plan](gateway/IMPLEMENTATION-PLAN.md) describe boundaries and planned work;
they do not imply that every planned behavior is implemented.

| Location | Responsibility |
| --- | --- |
| `src/app` | Next.js App Router pages, shared workspace shell, styles and HTTP route handlers. |
| `src/ui` | The UI component catalog. Follow the [frontend composition rules](frontend/README.md) before changing screens. |
| `src/components` | Previous feature views retained for reference during migration. |
| `src/hooks` | React hooks shared across feature components (`useChatStream`, `useConversations`, `useAIProvider`, `useGatewayEvents`). |
| `src/lib/chat` | Browser chat storage, attachments and stream parsing. |
| `src/lib/gateway/client.ts` | Shared browser gateway requests, client authentication state and event names. |
| `src/lib/gateway/contracts` | Shared gateway types and boundary validation. |
| `src/lib/gateway/providers` | Provider transport, model catalog, pricing and chat service. |
| `src/lib/gateway/runs` | Session and run state, events and recovery services. |
| `src/lib/gateway/server` | Server-side access, secrets, storage and service composition. |
| `src/lib/gateway/fixtures` | Gateway fixture data and verification. |
| `src/types` | Shared chat and domain types. |

Keep route handlers focused on HTTP boundaries and compose domain services behind
them. Keep server credentials and storage out of browser imports. Keep `src/lib/utils.ts`
focused on `cn()`. Use descriptive names and TypeScript narrowing at untrusted
boundaries. Prefer `async`/`await` when it makes asynchronous flow clearer, but
preserve transaction lifetime, cancellation, error handling and operation order.

Before modifying Next.js behavior, read the relevant guide in
`node_modules/next/dist/docs/`. Run the applicable checks in
[the gateway running guide](gateway/RUNNING.md); fixtures and a production build
do not replace the documented browser and deployment checks.
