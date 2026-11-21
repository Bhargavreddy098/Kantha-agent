# Handoff for the Swiss Workbench redesign

- **Scope** — Apply Swiss / International Typographic Style to the existing Web Workbench. Keep the frontend guide and agent instructions aligned with the Astryx-only component policy.
- **Status** — In review, 2026-11-21.
- **Outcome** — The shell, stream, prompt dock, reconnection states, and terminal share a Helvetica hierarchy, asymmetric grid, square geometry, and warm neutral surfaces with a red accent. The existing xterm renderer reads the Astryx palette.
- **Design reference** — [Frontend guide](../frontend/README.md) · [Shared theme](../../apps/web/src/swissTheme.ts) · [Layout](../../apps/web/src/index.css)

## Progress and working tree

- The Web Workbench composes Astryx controls through public exports and uses semantic HTML for page structure.
- The frontend guide, agent instructions, and stack references establish the same rules for new frontend work.
- `apps/web/package.json` and `apps/web/vite.config.ts` had pre-existing changes. The existing work in `main.tsx`, `index.css`, and `terminal/TerminalView.tsx` formed the baseline for this redesign.

## Verification

| Check | Result |
| --- | --- |
| `node node_modules/typescript/bin/tsc --noEmit -p apps/web/tsconfig.json` | Passed. |
| `node apps/web/node_modules/vite/bin/vite.js build apps/web` | Passed. Vite warned about the main chunk exceeding 500 kB. |
| gstack at 1440 × 900 and 390 × 844 | Verified the shared theme, connected shell, visible prompt label, and narrow-width layout without horizontal overflow. Mobile navigation opened and closed with Escape. |
| gstack with an isolated daemon | Submitted a prompt with Enter and saw the prompt, tool call, and result render in the stream. Verified that xterm mounted and had rows at desktop width, and the Terminal view fit the mobile viewport. |

## Resume

Approval decisions, expired-session recovery, and PTY command input still need a browser check if this work is used for full end-to-end qualification. The local browser run covered rendering and streaming. Astryx emitted its runtime theme-injection warning in development.
