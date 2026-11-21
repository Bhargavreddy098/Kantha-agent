# ADR-004: Consolidate Frontend on Vite, React 19, TanStack Router, Tailwind v4, and Radix UI

**Status:** ACCEPTED FOR PLANNING  
**Date:** 2026-11-21  
**Deciders:** Principal Software Architect, Frontend Lead  
**Technical Area:** Presentation Architecture, Styling & Bundling

---

## Context
The legacy application utilized Next.js with Webpack, driven by `@stylexjs/stylex` and Babel compilation requirements, alongside multiple overlapping icon packages and utility libraries. This resulted in:
1. Slow HMR and high memory usage during local development.
2. Tight coupling of client UI components with Next.js Server Components / SSR constraints.
3. Inability to compile cleanly as a standalone static SPA for local daemon embedding.

---

## Decision
1. **Transition to Pure Vite SPA:**
   - Rebuild the web workbench in `apps/web` as a pure Single Page Application using **Vite 6+** and **React 19.3.0**.
   - The compiled static assets (`dist/`) can be served directly by the Bun daemon or hosted statically.
2. **Type-Safe Routing & State Management:**
   - Standardize on **TanStack Router** for 100% type-safe file-based client routing.
   - Standardize on **TanStack Query** for client-side asynchronous caching and optimistic mutations.
3. **Streamlined Styling Hierarchy:**
   - Standardize on **Tailwind CSS v4 (`@tailwindcss/vite`)** for all utility styling and CSS variables.
   - Standardize on **Radix UI Primitives** for headless, accessible interactive elements (dialogs, dropdowns, popovers, tabs).
   - Standardize on **`lucide-react`** as the sole icon library.
4. **Eliminate StyleX & Babel:** Completely remove `@stylexjs/stylex`, `@stylexjs/babel-plugin`, `@babel/core`, and all legacy Webpack configs.

---

## Consequences
### Positive
- Sub-100ms Hot Module Replacement (HMR).
- Clean separation between frontend presentation and backend daemon.
- Zero server-side rendering (SSR) hydration mismatch issues.
- Enables seamless packaging into a future desktop shell (e.g. Tauri v2) with zero frontend modifications.

### Negative
- Existing Next.js page components in `src/app/` must be migrated to TanStack Router routes in `apps/web/src/routes/`.
