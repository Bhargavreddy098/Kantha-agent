# Frontend composition and migration

Kantha uses the installed `@astryxdesign/core` component library. Use `packages/ui` as a reference for examples, source details, and component documentation. The installed package defines the supported props, slots, interactions, and responsive behavior.

## Rules for agents

1. Import UI from public Astryx subpaths, for example `import { Dialog } from "@astryxdesign/core/Dialog"`. Use slots and documented props for layout, typography, navigation, controls, messaging and feedback.
2. Put route composition and feature behavior outside `packages/ui`. Keep data loading, routing, validation and gateway calls in feature code or existing hooks. Semantic HTML for document and form boundaries is fine.
3. Keep the existing theme, tokens, accessibility and interaction patterns. The shell owns the main landmark, skip link and mobile navigation. Give each route one page heading.
4. Use installed Astryx components for icons, overlays, form controls and loading states. If a capability is missing, record the candidate components and the exact gap in the work handoff. Get explicit approval before adding a local component, copying external UI source or introducing a dependency.

## Feature surfaces

| Slice | Components to inspect | Behavior to verify |
| --- | --- | --- |
| 1. App shell | `AppShell`, `TopNav`, `SideNav`, `Center`, `EmptyState`, `theme` | Shared layout, selected route, keyboard skip link, collapsible sidebar and mobile drawer. |
| 2. Workspace access | `Card`, `FormLayout`, `TextInput`, `Button`, `Banner` | Workspace token exchange at `/api/gateway/access`, session recheck on focus or HTTP 401, and sign-out. |
| 3. Chat and history | `Chat`, `Drawer`, `SideNav`, `Selector`, `FileInput`, `Markdown` | Browser history, provider-scoped model selection, attachments, streaming, Stop, retry and partial output. |
| 4. Model providers | `Card`, `FormLayout`, `TextInput`, `Selector`, `Collapsible`, `AlertDialog` | Owner access, connection save, test and discovery, model selection, credential replacement and revocation. |
| 5. Settings | `Card`, `Badge`, `Banner`, `MetadataList`, `Collapsible` | Workspace controls, gateway readiness and retry, usage freshness, reported totals and limits. |

The shared shell is mounted by `src/app/layout.tsx`. The workspace access gate holds route content until the gateway confirms the signed HttpOnly session. The sign-in token and provider keys are submitted to their gateway endpoints and cleared from the form after a successful exchange. Browser API calls use the session cookie. Provider management requires an owner on both the screen and the gateway.

Chat uses `/api/chat/models`, the existing `useChat` transport on `/api/chat`, and IndexedDB. Browser history belongs to the authenticated workspace and actor. Older unassigned rows remain in IndexedDB for recovery and are excluded from authenticated history. A reload restores the last selected conversation for the same actor in the tab. The gateway remains authoritative for run state and usage.

## Build and verify

Run `npm run dev` or `npm run build`. The root layout loads Astryx's precompiled reset and component CSS. The workspace shell uses the precompiled Neutral theme, and `src/app/layers.css` declares the cascade order. App type checking and linting skip the reference catalog.

For the shell, check `/` redirects to `/chat`, each route highlights its link, and the mobile drawer closes after navigation or Escape. Check keyboard focus, the skip link, and the layout at desktop and narrow widths.

After a production build, run `node scripts/test-gateway-fixtures.mjs`, `node --test scripts/test-gateway-routes.mjs`, and `node --test --test-force-exit scripts/test-chat-stream.mjs` to exercise the fixture contracts, HTTP boundaries and AI SDK stream.

Run the browser flow on desktop and mobile with an isolated gateway and a fixture provider. Sign in, add and test a connection, discover models, select one in Chat, stream a reply, stop a second reply, reload the conversation, and review Settings usage. Check credential replacement, revocation and the owner/member boundary. Repeat with a qualified non-production provider when one is available. Track standalone approval and runtime qualification using the [gateway contracts](../gateway/CONTRACTS.md) and [implementation plan](../gateway/IMPLEMENTATION-PLAN.md).

See [performance profiling and deployment](../PERFORMANCE.md) for measurement, caching, and static asset setup.
