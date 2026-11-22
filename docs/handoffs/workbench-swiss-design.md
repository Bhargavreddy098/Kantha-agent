# Handoff for the Swiss Workbench redesign

- **Scope** — Apply Swiss / International Typographic Style to the existing Web Workbench and maintain the Astryx-only component policy.
- **Status** — In review, 2026-11-21.
- **Outcome** — The workbench uses a monochrome Astryx theme, an aligned session grid, and a compact heading with Activity and Terminal tabs. The first prompt sits below the empty-state guidance. The same composer docks beneath the stream once activity starts.
- **Design reference** — [Frontend guide](../frontend/README.md) · [Shared theme](../../apps/web/src/swissTheme.ts) · [Layout](../../apps/web/src/index.css)

## Progress and working tree

- Astryx owns the shell dividers, tabs, controls, status indicators, code blocks, and cards. App CSS handles shared gutters, transcript rows, and composer and terminal layout.
- Removed additional shell borders, duplicate palette and typography rules, a custom scrollbar, and unused Neutral font and theme stylesheet imports. xterm remains the terminal renderer and reads the shared palette.
- `apps/web/package.json` and `apps/web/vite.config.ts` were already modified before the redesign.

## Verification

| Check | Result |
| --- | --- |
| `node node_modules/typescript/bin/tsc --noEmit -p apps/web/tsconfig.json` | Passed. |
| `node apps/web/node_modules/vite/bin/vite.js build apps/web` | Passed. Vite warned about the main chunk exceeding 500 kB. |
| `git diff --check` | Passed. |
| gstack at 1440 × 900 with an isolated daemon | Confirmed first-prompt placement. Enter submitted the prompt, Astryx code blocks rendered tool activity, and the composer moved to the bottom. Arrow Right and Enter opened Terminal, which rendered 43 rows. |
| gstack at 390 × 844 | Activity fit without horizontal overflow, Terminal was hidden when inactive, and Escape closed the mobile navigation. |

## Resume

Approval submission, expired-session recovery, and interactive PTY command input were outside the browser checks for this visual refinement.
