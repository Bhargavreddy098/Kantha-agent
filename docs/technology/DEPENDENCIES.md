# Dependency Analysis & Packaging Specification

**Status:** APPROVED FOR PLANNING  
**Version:** 2.0.0  
**Effective Date:** 2026-11-21  
**Document Level:** Level 2 — Technology Specification

---

## 1. Monorepo Packaging Topology

The repository is organized as a **Turborepo + Bun Workspaces** monorepo:

```
kantha-monorepo/
├── turbo.json
├── package.json               # Root workspace manifest
├── apps/
│   ├── daemon/                # Bun v1.4+ Runtime, Effect HttpApi & Harness
│   ├── web/                   # Vite + React 19 + TanStack Router/Query SPA
│   └── cli/                   # React Ink Terminal UI
└── packages/
    ├── protocol/              # Shared Effect Schemas, RPC, and SSE wire types
    ├── db/                    # Drizzle schemas and bun:sqlite queries
    └── ui/                    # Shared Radix / Tailwind v4 components
```

---

## 2. Core Dependencies by Package

### 2.1 Root Workspace (`/`)
| Package | Version | Purpose |
|---|---|---|
| `turbo` | `^2.4.0` | Monorepo task pipeline management and caching |
| `typescript` | `^5.7.3` | Shared TypeScript compiler |

### 2.2 Daemon Application (`apps/daemon`)
| Package | Version | Purpose |
|---|---|---|
| `effect` | `^3.13.0` | Concurrency, fiber runtime, error management, resource scopes |
| `@effect/platform` | `^0.74.0` | HTTP router and server platform primitives |
| `@effect/platform-bun` | `^0.53.0` | Bun HTTP adapter for Effect |
| `@effect/schema` | `^0.78.0` | Runtime validation and wire contracts |
| `ai` | `^4.1.0` | Vercel AI SDK Core (multi-provider streaming, tool abstractions) |
| `@ai-sdk/anthropic` | `^1.1.0` | Claude provider adapter |
| `@ai-sdk/openai` | `^1.1.0` | OpenAI provider adapter |
| `@ai-sdk/openai-compatible`| `^0.1.0` | Local models (Ollama, vLLM, Gemini) |
| `bun-pty` | `^0.2.0` | Windows pseudo-terminal support |
| `drizzle-orm` | `^0.39.0` | SQLite query builder |

### 2.3 Web Workbench Application (`apps/web`)
| Package | Version | Purpose |
|---|---|---|
| `react` | `19.3.0` | UI rendering engine |
| `react-dom` | `19.3.0` | DOM bindings for React 19 |
| `@tanstack/react-router` | `^1.110.0`| Type-safe client routing |
| `@tanstack/react-query` | `^5.66.0` | Server state management and caching |
| `tailwindcss` | `^4.0.0` | Layout and utility styling |
| `@tailwindcss/vite` | `^4.0.0` | Vite plugin for Tailwind CSS v4 |
| `@xterm/xterm` | `^5.5.0` | Browser terminal emulator for PTY streams |
| `@xterm/addon-fit` | `^0.10.0`| Dynamic resizing for xterm |
| `lucide-react` | `^1.72.0` | UI icon glyphs |
| `@radix-ui/react-dialog` | `^1.1.0` | Accessible dialogs |
| `@radix-ui/react-dropdown-menu` | `^2.1.0` | Accessible dropdowns |
| `@radix-ui/react-tabs` | `^1.1.0` | Accessible tab views |
| `vite` | `^6.2.0` | Bundler and dev server |
| `@vitejs/plugin-react` | `^4.3.0` | React support for Vite |

### 2.4 Terminal CLI Application (`apps/cli`)
| Package | Version | Purpose |
|---|---|---|
| `ink` | `^5.1.0` | React-based terminal UI rendering |
| `ink-spinner` | `^5.0.0` | Terminal spinner for in-flight tasks |
| `meow` | `^13.2.0` | CLI argument parsing |

### 2.5 Protocol Package (`packages/protocol`)
| Package | Version | Purpose |
|---|---|---|
| `effect` | `^3.13.0` | Effect Schema primitives |
| `@effect/schema` | `^0.78.0` | Shared domain event and request schemas |

### 2.6 Database Package (`packages/db`)
| Package | Version | Purpose |
|---|---|---|
| `drizzle-orm` | `^0.39.0` | Schema definitions and query building |
| `drizzle-kit` | `^0.30.0` | Schema migrations generator |
