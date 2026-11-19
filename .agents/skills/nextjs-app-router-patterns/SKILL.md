---
name: nextjs-app-router-patterns
description: "Production architectural patterns, folder structure conventions, Server/Client component boundaries, and streaming optimizations for Next.js App Router (14, 15, 16) with TypeScript. Use when structuring Next.js projects, organizing routes and components, or implementing App Router features."
---

# Next.js App Router Patterns & Architecture

Best practices for structuring and writing Next.js App Router applications with TypeScript.

## 1. Project & Directory Organization

Follow a clean, predictable project layout:
```
src/
├── app/                  # Next.js App Router: routes, layouts, errors, route handlers
│   ├── api/              # API Route Handlers (route.ts)
│   ├── chat/             # /chat page and route-specific UI
│   ├── settings/         # /settings page
│   ├── globals.css       # Global styles and Tailwind imports
│   ├── layout.tsx        # Root layout with font and metadata
│   └── page.tsx          # Root landing page / redirect
├── components/           # Feature and shared UI components
│   ├── block/            # Shell and domain blocks (dashboard, settings panels)
│   ├── chat/             # Chat feature components (sidebar, header, composer, message list)
│   ├── gateway/          # Gateway monitoring and status components
│   └── ui/               # Reusable foundational design system components (buttons, dialogs, cards)
├── hooks/                # Custom React client hooks (e.g., useChatStream, useGatewayEvents)
├── lib/                  # Core domain logic, utilities, database, and API clients
│   ├── chat/             # Chat state management, persistence, and SSE parser
│   ├── gateway/          # Gateway services, providers, access control, and contracts
│   └── utils.ts          # Utility functions (focused on cn() and class merging)
└── types/                # Domain TypeScript type definitions and interfaces
```

**Conventions**:
- Avoid placing loose component folders at the repository root outside `src/`. All components should reside under `@/components/...` mapped to `src/components/...`.
- Colocate subcomponents that are strictly used within a single feature under that feature's directory.

## 2. Server Components vs Client Components
- **Server Components by Default**: All components in the `app/` directory are React Server Components (RSC) by default unless marked with `"use client"`.
- **Granular Client Boundaries**: Push `"use client"` down the component tree. Keep layouts and page wrappers as Server Components where possible, isolating client state and browser event listeners inside dedicated interactive leaf components.

## 3. Route Handlers (`route.ts`)
- Use standard `NextRequest` and `NextResponse` / `Response`.
- Keep route handlers focused on HTTP boundaries (deserializing inputs, status codes, streaming responses) and delegate business logic to domain services in `src/lib/`.
- Handle errors cleanly with appropriate HTTP status codes (400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 500 Internal Server Error).

## 4. Streaming and Concurrency
- Utilize Suspense boundaries around components performing async data fetches to enable progressive rendering.
- For AI chat and real-time feeds, stream responses using standard Web ReadableStream, EventSource, or Server-Sent Events (SSE).
