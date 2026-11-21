# Build & Styling Architecture Specification

**Status:** APPROVED FOR PLANNING  
**Version:** 2.0.0  
**Effective Date:** 2026-11-21  
**Document Level:** Level 2 — Technology Specification

---

## 1. Problem Statement & Modernization

The prior application architecture suffered from multiple competing build pipelines and CSS approaches:
- Next.js Webpack mode forced by `@stylexjs/stylex` and Babel plugins.
- Slow cold starts and high memory consumption.
- Redundant styling layers and icon libraries.

**The Solution:**  
The presentation tier is unified into a **pure Vite + React 19 Single Page Application (SPA)** in `apps/web`:
- **Vite 6+**: Sub-100ms HMR and optimized static production builds via Rollup.
- **Tailwind CSS v4 (`@tailwindcss/vite`)**: CSS-first layout utilities with native `@theme` directives.
- **Radix UI Primitives**: Headless, accessible primitives providing focus rings, ARIA roles, and keyboard navigation.
- **Complete StyleX & Babel Pruning**: Zero Babel compilation dependencies; 100% native ESM.

---

## 2. Canonical Styling Hierarchy

```
+-------------------------------------------------------------------------+
| Layer 1: Tailwind CSS v4 (@tailwindcss/vite)                            |
| Sovereignty: CSS-First Design Tokens, Layout (Flex/Grid), Spacing       |
+-------------------------------------------------------------------------+
                                    │
                                    ▼
+-------------------------------------------------------------------------+
| Layer 2: Radix UI Primitives (@radix-ui/*)                              |
| Sovereignty: Headless Accessibility, Focus Management, Keyboard Nav     |
+-------------------------------------------------------------------------+
                                    │
                                    ▼
+-------------------------------------------------------------------------+
| Layer 3: Lucide Icons (lucide-react)                                    |
| Sovereignty: Sole Authorized Glyph Suite for UI Icons                   |
+-------------------------------------------------------------------------+
```

---

## 3. Web Workbench Architecture (`apps/web`)

### 3.1 Routing & Navigation
Routing is governed by **TanStack Router**:
- 100% type-safe file-based route definitions in `apps/web/src/routes/`.
- Built-in search param validation with automatic serialization.
- Code splitting and route preloading out of the box.

### 3.2 State & Data Fetching
Server state synchronization is managed by **TanStack Query**:
- Automatic caching, deduplication, and background refetching of daemon state.
- Seamless optimistic mutations for task submission and tool approvals.
- Integration with daemon SSE streams for real-time cache updates.

### 3.3 Interactive Terminal Component
Interactive terminal sessions are rendered using `@xterm/xterm`:
- Directly attaches to the daemon's WebSocket PTY bridge.
- Renders full ANSI colors, cursor manipulation, and interactive inputs (vim, htop, bash).

---

## 4. Classname Utility Standards

When dynamic class merging is needed for container layouts:
```typescript
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```
