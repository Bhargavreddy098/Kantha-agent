# Gateway frontend UI/UX

Use the existing React, Next.js and Astryx application. Read the [gateway contracts](../gateway/CONTRACTS.md) and corresponding [agent assignment](../gateway/IMPLEMENTATION-PLAN.md) before wiring a screen. Compose existing project components first, then use verified public exports from installed `@astryxdesign/core`. Verify exports and props against the installed declarations. Preserve the existing neutral theme, CSS layer order and keyboard behavior. A new dependency, imported third-party implementation or custom reusable primitive needs explicit approval under the [repository instructions](../../AGENTS.md).

## Navigation and layout

Keep **Chat** as the main member workflow and **Settings** as the operator workflow. Use the existing [DashboardShell](../../src/components/block/dashboard-shell.tsx), [navigation config](../../src/components/block/dashboard-shell-config.ts), and [SettingsDialog](../../src/components/block/settings-dialog.tsx). Use the provider section for managed upstream connections. Introduce Gateway Status and Usage as settings sections when their server contracts land.

```text
Desktop
Dashboard navigation | Chat header · connection state · model selector
                     | Conversation                         | Run details
                     | Existing composer · send / stop       | approval if pending

Settings             | Model providers  | Gateway status  | Usage
                     | Connections      | Readiness       | Window and totals
                     | Add / Test       | Safe details    | Freshness and limits

Narrow layout
Dashboard navigation collapses. Chat keeps the conversation and composer.
Run details and Settings stack vertically or open with an approved overlay.
```

## Screen slices

| Surface and owner | Layout and primary action | State and recovery |
|---|---|---|
| **Gateway status · 02** | Settings row or section with readiness label, last checked time and Retry. Use the existing shell and verified Astryx status and feedback primitives. | Checking, starting, ready, unavailable and stale. Starting uses the server retry hint. Keep the last successful state labelled with its age. Status detail applies access scope and renders a safe request ID when relevant. |
| **Model providers · 03** | Reuse [ModelProvidersView](../../src/components/block/model-providers-view.tsx) with a connection list and settings form. Add or replace a connection with name, upstream Base URL and transient password input. Test, discover and select an eligible model. | Keep Test and Save results distinct. Show saving, testing, discovery, invalid credential, endpoint rejected, timeout, empty catalog and revoked or disabled selection. Keep non-secret draft values on failure. Clear the key after a successful save. Reopen with safe saved status and an empty replacement field. |
| **Chat and model selection · 04** | Keep [Chat](../../src/app/chat/page.tsx), its `useChat` transport, existing messages and picker. Reuse [PromptInput](../../src/components/ui/prompt-input.tsx) where the app already uses it. Keep Send and Stop in the composer, with the current model visible. | Show a provider setup link when there are no eligible models. Preserve a draft when send fails. Show streamed output, terminal error and retry guidance as part of the conversation. Stop has a pending state until acknowledged. A retry is an explicit submission, and partial output remains visible. |
| **Run status and recovery · 05** | Put compact status near the active turn. Use optional run details for progress and the last known server state. | Distinguish reconnecting, waiting, interrupted, cancelled and completed. Preserve visible output while reconnecting. If replay is unavailable, reload the authorized snapshot and restore the same run, including any pending approval. Show one progress announcement per meaningful transition. |
| **Usage · 06** | In Settings, show the time window, total attempts and reported usage, budget state and last updated time. Reuse verified Astryx data, progress and feedback components. | Distinguish zero usage, missing measurements, stale totals, estimate and limit reached. State the unit and window. Give budget denials a safe explanation and direct eligible users to Usage. |
| **Approval · 07** | Show the pending action inside the active turn or details panel. Render the action summary, target, relevant parameters and Approve or Reject. Reuse verified form and dialog primitives where required. | Show waiting, deciding, approved, rejected, expired and interrupted. After an ambiguous response, reload server state before offering a decision again. Show a read-only outcome after resolution. |
| **Child runs · 09** | Place child runs under their parent run details. Show parent relationship, purpose, status and allowed actions. | Keep each child status distinct. Surface partial completion, cancellation and interruption without blocking unrelated conversation actions. |

## Browser acceptance

- Run the real flow from Settings → Model providers → Test and discover → Chat → select → send → stop or reconnect → Usage. Start with fixtures, then use one qualified non-production provider. At narrow widths the composer and primary actions remain reachable while details can scroll independently.
- Verify keyboard access and visible focus for settings, selector, composer, stop and approvals. When an overlay closes, restore focus to the originating control. Give controls accessible names, expose errors next to the field, respect reduced motion and pair status colors with text.
- Keep routine streaming updates out of assertive announcements. Announce important transitions such as a required approval, a disconnected stream, or a failed submission. Preserve the composer draft and useful status through retries after a recoverable failure.
- Cover empty catalogs, delayed probes, invalid keys, provider throttling, a mid-stream disconnect, a stale approval, a refreshed session and missing usage. Check that the browser stores no provider secret and that private settings and run state follow workspace authorization.
