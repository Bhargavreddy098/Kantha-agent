# Design Document: Astryx-First Swiss AI Chat Redesign & Model Selection

**Date:** 2026-11-22  
**Status:** Approved by User (Approach C: Astryx-First Hybrid)  
**Target:** `apps/web` (UI / Astryx Components) & `apps/daemon` (Origin Fencing & Multi-Model Routing) in Kantha Monorepo  

---

## 1. Intent and the Why

The initial implementation of the Swiss AI Chat interface suffered from raw styling defects (visible unstyled borders, native browser textarea outlines, and default resize handles) due to missing stylesheet imports from `@astryxdesign/core` and `@astryxdesign/theme-neutral`. Furthermore, the sidebar navigation terminated abruptly with an incomplete bottom bar, lacking a persistent settings interface, and the chat composer was missing an integrated model selector.

This design document establishes the architecture for **Approach C (Astryx-First Hybrid)**:
1. Elevating the visual fidelity to modern high-craft standards (comparable to Claude and Cursor) while strictly maintaining Astryx Design as the authoritative design system and adhering to the Swiss International Typographic Style.
2. Introducing a true full-height sidebar with a pinned settings footer that launches an accessible, tabbed Swiss Settings Modal dialog.
3. Upgrading the chat composer into a premium floating card with an integrated model selection popover driven dynamically by the daemon's `/api/providers` endpoint.
4. Correcting daemon Ingress Fencing so that local loopback development servers (Vite on ports 3000, 5173, 5174, etc.) are securely accepted without `Forbidden: Unauthorized Origin` errors.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- **Astryx Authoritative System:** Rely on `@astryxdesign/core` and `@astryxdesign/theme-neutral` for `AppShell`, `ChatLayout`, `ChatComposer`, `Dialog`, `DropdownMenu`, `Button`, `IconButton`, `TabList`, and design tokens.
- **Full-Height Sidebar:** Complete viewport height flexbox column with pinned header, search, scrollable grouped threads (`Today`, `Yesterday`, `Previous 7 Days`, `Older`), and a persistent bottom footer featuring the Settings dialog trigger and quick theme toggle.
- **Comprehensive Settings Modal:** An accessible Astryx `Dialog` with tabs for Models & Providers (daemon discovery, active status), Appearance (Light / Dark theme), and Data & Storage (Dexie stats, clear history).
- **Premium Chat Composer:** A floating, centered card with subtle border, soft elevation, drag-and-drop file attachment drawer, send/stop controls, and a dynamic **Model Selector** dropdown.
- **End-to-End Model Routing:** Dynamic discovery of models from `/api/providers`, local storage persistence of chosen model, and forwarding to `/api/chat/stream`.
- **Secure Origin Configuration:** Broaden daemon loopback ingress fencing to cover standard Vite dev server ports and custom `KANTHA_ALLOWED_ORIGINS` without weakening security boundaries against external origins.

### Non-Goals
- Introducing Tailwind CSS, shadcn/ui, or an independent bespoke component library.
- Removing Astryx Design primitives.
- Cloud account management or external user authentication.

### Anti-Goals
- No unstyled native inputs or browser outlines.
- No cartoonish gradients, rounded floating blobs, or purple AI aesthetics.
- No hardcoded model dropdown options that desync from daemon capabilities.

---

## 3. Constraints

1. **Component System:** `@astryxdesign/core` and `@astryxdesign/theme-neutral` must remain primary.
2. **Framework:** React 19, TypeScript, Vite in `apps/web`; Bun / Node compatibility in `apps/daemon`.
3. **No Tailwind:** Scoped CSS and CSS variables aligned with Astryx tokens only.
4. **Data Isolation:** Dexie.js (IndexedDB) for client-side chat storage; in-memory sessions for daemon auth.

---

## 4. Approaches Considered

- **Approach A: Strict Astryx Core Primitive Styling** — Fast, but constrained by default slot limitations.
- **Approach B: Bespoke Swiss Component Suite** — Maximum visual freedom, but deviates from Astryx-first requirement.
- **Approach C: Astryx-First Hybrid (Selected)** — Imports official Astryx stylesheets (`astryx.css`, `theme.css`), leverages Astryx primitives (`AppShell`, `ChatLayout`, `ChatComposer`, `Dialog`, `DropdownMenu`, `TabList`, `Button`, `IconButton`) as the authoritative foundation, and customizes presentation using Astryx tokens and scoped Swiss CSS.

---

## 5. Architectural Components & Implementation Details

### A. Stylesheet Ingestion (`apps/web/src/index.css`)
Import `@astryxdesign/core/dist/astryx.css` and `@astryxdesign/theme-neutral/dist/theme.css` at the very top of `index.css`. Map Swiss tokens (`--swiss-bg`, `--swiss-surface`, `--swiss-text`, `--swiss-accent`, `--swiss-border`) to Astryx CSS variables.

### B. Full-Height Sidebar (`apps/web/src/components/Sidebar.tsx`)
1. Fixed 280px width (56px collapsed), spanning 100% of viewport height.
2. Header with Swiss Red square badge, brand name, and collapse trigger.
3. New Chat action button and search filter input.
4. Scrollable grouped history with active conversation highlighting.
5. Pinned bottom footer with:
   - Thread count badge.
   - Theme toggle button.
   - Settings trigger button (`⚙ Settings`).

### C. Settings Modal Dialog (`apps/web/src/components/SettingsDialog.tsx`)
1. Accessible Astryx `Dialog` with width 540px.
2. Tab strip (`Models & Providers`, `Appearance`, `Data & Storage`, `Connection`).
3. Models tab displays active providers (Anthropic, OpenAI, Ollama) and allows changing the default model.
4. Appearance tab switches Light / Dark mode.
5. Data tab displays Dexie statistics and allows clearing chat history.

### D. Premium Chat Composer (`apps/web/src/components/Composer.tsx`)
1. Floating container (850px max width) with subtle elevation.
2. Multi-line auto-resizing input with keyboard shortcuts (`Enter` to send, `Shift+Enter` for newline).
3. File attachment preview drawer and drag-and-drop indicator.
4. Integrated footer:
   - Left: Astryx `DropdownMenu` model selector pill + File attach button.
   - Right: Circular send / stop button.

### E. Daemon Ingress Fencing Fix (`apps/daemon/src/api/auth/fencing.ts` & `router.ts`)
1. In `fencing.ts`, expand `devOriginAllowed` to include common Vite ports (3000-3010, 5173-5180, 4173) and parse `process.env.KANTHA_ALLOWED_ORIGINS`.
2. In `router.ts`, ensure `isDev` defaults to true when `NODE_ENV !== "production"`.
3. In `chat.ts`, cleanly support model routing without crashing if an Ollama local model is chosen.

---

## 6. Verification Plan

1. **Compilation & Typecheck:** `pnpm --filter @kantha/web typecheck` passes with zero errors.
2. **Build Verification:** `pnpm --filter @kantha/web build` compiles the production Vite bundle without warnings.
3. **Daemon Unit Tests:** Verify `fencing.test.ts` / security suite passes.
4. **Visual Layout Verification:** Full sidebar height, bottom settings modal, model selector dropdown, and responsive collapse.
