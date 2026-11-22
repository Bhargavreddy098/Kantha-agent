# Design Document: Swiss International AI Chat Application (Astryx & Kantha Stack)

**Date:** 2026-11-22  
**Status:** In Review  
**Target:** `apps/web` (Frontend) & `apps/daemon` (Backend Services) in Kantha Monorepo  

---

## 1. Intent and the Why

The goal is to build a production-quality, responsive AI chat application designed under the **Swiss International Typographic Style** (International Typographic Style / Bauhaus legacy). The system prioritizes strict mathematical grid alignment, high-contrast typography, generous negative space, hairline borders, and restrained Swiss-red accents (`#E53935`) over generic conversational AI tropes (e.g., oversized pastel bubbles, heavy drop shadows, neon gradients, and playful glassmorphism).

Rather than an isolated UI mockup or a disconnected Next.js application, this application serves as the primary Web Workbench interface in Kantha (`apps/web`), backed by the local Bun daemon (`apps/daemon`) and browser-local IndexedDB storage via Dexie.js. It delivers genuine real-time SSE token streaming, clear reasoning/thinking disclosure, multimodal file processing, and document text extraction.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- **Swiss International Design Execution:** Impeccable typographic hierarchy (Helvetica/Inter), 12-column grid alignment, 8px modular spacing, clean monochromatic surfaces (`#F8F8F6`, `#FFFFFF`, `#171717`, `#737373`, `#E5E5E3`), and functional Swiss-red accents.
- **Astryx Component Foundation:** Exclusively build upon `@astryxdesign/core` and `@astryxdesign/theme-neutral` (`AppShell`, `ChatLayout`, `ChatMessage`, `ChatMessageBubble`, `ChatComposer`, `Collapsible`, `CodeBlock`, `Button`, `Dialog`).
- **Real-Time Streaming & Reasoning:** Genuine SSE token streaming with separate extraction of provider reasoning blocks (`reasoning_content` / thinking deltas) into a collapsible Swiss-styled "THINKING" disclosure.
- **Local-First Persistence:** Complete browser-local history using Dexie (IndexedDB)—persisting conversations, messages, timestamps, roles, reasoning content, and attachment metadata without requiring cloud accounts or remote databases.
- **Multimodal & Document Processing:** Client upload zone supporting images (PNG, JPG, WebP) and documents (PDF, DOCX, TXT, MD, CSV) with server-side text extraction in `apps/daemon` without permanent server file storage.
- **Responsive & Accessible:** Fluid transition across Desktop (sidebar + 850px reading column), Tablet, and Mobile (drawer navigation), respecting reduced-motion accessibility.

### Non-Goals
- Cloud user authentication, multi-tenant databases, or remote chat synchronization across different machines.
- Permanent server-side file storage (files and extracted text reside client-side in IndexedDB).
- Synthetic/mock streaming simulation (streaming must be backed by genuine OpenAI-compatible SSE endpoints).

### Anti-Goals
- **No Tailwind CSS:** Do not install or configure Tailwind CSS, utility class frameworks, or shadcn/ui.
- **No Next.js Migration:** Do not rewrite or introduce Next.js into the monorepo; retain Vite + React 19 in `apps/web` and Bun in `apps/daemon`.
- **No Generic AI Chatbot Aesthetics:** Avoid bubbly rounded cards, colored user bubbles, gradients, or glassmorphic blur filters that contradict the Swiss design ethos.

---

## 3. Constraints

1. **Component Library:** Mandatory exclusive use of `@astryxdesign/core` and `@astryxdesign/theme-neutral`.
2. **Architecture:** Monorepo preservation—`apps/web` (Vite, React 19, TypeScript) and `apps/daemon` (Bun HTTP server, Node runtime compatibility).
3. **Security:** Zero secret leakage—all API keys, provider base URLs, and model defaults reside server-side in `apps/daemon` environment variables.
4. **Client-Side Storage:** Browser-local IndexedDB via `dexie` and `dexie-react-hooks`.
5. **Payload Limits:** Maximum 10MB per file, up to 5 attachments per message, and 25MB total payload.

---

## 4. Approaches Considered

### Approach 1: Dedicated Daemon Chat & Document Services with Dexie Persistence (Selected)
- **Frontend (`apps/web`):** Built with Astryx `AppShell` (for navigation, sidebar, and grid frame), `ChatLayout` (docked composer, scroll handling), `ChatMessage` + `ChatMessageBubble` (ghost variant for editorial typography), `ChatComposer`, `Collapsible` (for reasoning), and `CodeBlock`. Persistence via Dexie with reactive live queries.
- **Backend (`apps/daemon`):** Introduces `POST /api/chat/stream` for OpenAI-compatible SSE forwarding with live reasoning parsing, and `POST /api/documents/extract` for server-side PDF/DOCX text extraction without disk persistence.
- **Why Selected:** Seamlessly integrates with the existing Kantha daemon architecture, eliminates secret leakage, provides offline-first browser resilience, and leverages Astryx's production-tested chat components.

### Approach 2: Deep Daemon Harness Integration (Rejected)
- Routes all messages through Kantha's multi-step `EffectHarnessRunner` and SQLite session tables.
- **Why Rejected:** Adds unnecessary coupling to agent execution loops, task planning, and SQLite checkpointing when the user requirement specifies browser-local Dexie persistence and direct OpenAI streaming.

### Approach 3: Client-Direct LLM Access (Rejected)
- Frontend directly communicates with OpenAI API using browser-entered API keys.
- **Why Rejected:** Violates the explicit requirement that API credentials must stay server-side and never leak to the browser.

---

## 5. Detailed Design & Architecture

### 5.1 Visual Design & Swiss Theme Tokens
- **Palette:**
  - Canvas Background: `#F8F8F6` (warm off-white)
  - Surface / Panels: `#FFFFFF` (pure white)
  - Text Primary: `#171717` (near-black)
  - Text Secondary: `#737373` (neutral gray)
  - Hairline Borders: `#E5E5E3` (subtle neutral)
  - Accent: `#E53935` (Swiss red, reserved for active conversation markers, streaming indicators, and primary triggers)
  - Hover Surface: `#F0F0EE`
  - Dark Mode Background: `#141414` (with corresponding dark surface `#1F1F1F` and border `#2E2E2E`)
- **Typography:**
  - Font Stack: `Inter`, `-apple-system`, `BlinkMacSystemFont`, `Helvetica Neue`, sans-serif
  - Code Font: `JetBrains Mono`, `ui-monospace`, monospace
  - Scale:
    - Product / App Title: 24–28px, bold, tight tracking
    - Section Headings: 14–16px, semibold
    - Body Text: 14–15px, line-height 1.6
    - Metadata / Labels: 11–12px, uppercase, letter-spacing +0.05em
- **Grid & Spacing:**
  - 12-column layout container, max-width 850px for chat reading column
  - 8px modular spacing increments (8px, 16px, 24px, 32px)
  - Hairline `1px solid #E5E5E3` dividers separating panels instead of container shadows.

### 5.2 Astryx Component Mapping

| UI Section | Astryx Component | Customization / Role |
| :--- | :--- | :--- |
| **App Shell** | `AppShell` (variant="section") | Provides the 280px editorial sidebar slot (`sideNav`), top header (`topNav`), and main workspace container (`children`). Automatic mobile drawer integration below `md` breakpoint. |
| **Navigation Sidebar** | Astryx `Button`, `IconButton`, `Divider`, `ScrollableArea` | Minimal logo, "New Chat" action, search input, time-grouped conversation list (Today, Yesterday, 7 Days, Older), active item highlighted with 2px `#E53935` Swiss-red left border. |
| **Chat Layout** | `ChatLayout` (density="balanced") | Manages message scroll flow, anchored composer dock, and scroll-to-bottom action with `useChatStreamScroll`. |
| **Empty State** | Astryx typography + prompt buttons | Clean editorial layout: "What would you like to explore?", secondary copy, and 1-click suggestion prompt cards. |
| **Message List** | `ChatMessageList` + `ChatMessage` | `sender="user"` vs `sender="assistant"`. Uses `ChatMessageBubble` with `variant="ghost"` and `width="100%"` for editorial typographic layout. |
| **Thinking Panel** | Astryx `Collapsible` | Placed immediately above assistant response. Features uppercase "THINKING" label, thin left red/gray accent line, expand/collapse trigger, and real-time reasoning stream. |
| **Code Blocks** | Astryx `CodeBlock` | Syntax highlighted with copy buttons, language tags, line numbers, and monospace font. |
| **Markdown Body** | Custom Swiss Markdown Renderer | Renders headings, lists, tables, links, blockquotes, and delegates code blocks to Astryx `CodeBlock`. |
| **Composer Dock** | `ChatComposer` (elevation="none") | Monochromatic bordered composer with multiline auto-resizing input, `drawer` for attachment chips, `footerActions` for upload triggers, and `sendButton` / `isStopShown` toggles. |
| **Modals / Prompts** | Astryx `Dialog` / `AlertDialog` | Used for conversation deletion confirmation and file error alerts. |

### 5.3 Client-Side Storage Architecture (Dexie / IndexedDB)

Database Name: `KanthaSwissChatDB`

```typescript
// Dexie schema definition
interface Conversation {
  id: string; // UUID
  title: string;
  createdAt: number;
  updatedAt: number;
}

interface StoredAttachment {
  id: string;
  name: string;
  type: string; // MIME type
  size: number;
  dataUrl?: string; // For images
  extractedText?: string; // For documents
}

interface Message {
  id: string; // UUID
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  reasoning?: string;
  attachments?: StoredAttachment[];
  timestamp: number;
  status?: 'complete' | 'streaming' | 'error';
}
```

Stores and indexes:
- `conversations`: `id, createdAt, updatedAt`
- `messages`: `id, conversationId, role, timestamp`

Reactive queries (`useLiveQuery`) automatically refresh the sidebar conversation groups and active message history with zero polling.

### 5.4 Backend Daemon Endpoints (`apps/daemon`) & Upstream API Payload Strategy

1. **`POST /api/chat/stream`**
   - **Headers:** `Content-Type: application/json`
   - **Body:** `{ messages: Array<{ role: string; content: string | Array<any> }>, model?: string }`
   - **Multi-Turn Context Budgeting & Safety Strategy (Builder Rulings):**
     - **Reasoning Sanitization:** Prior assistant `reasoning` / thinking blocks stored in Dexie are strictly omitted when serializing message history to upstream OpenAI `/chat/completions`. Upstream APIs reject unknown reasoning fields in historical assistant messages.
     - **Document Context Budgeting:** Text extracted from documents is injected into the user turn with clear delimiter headers (`--- Document: filename.pdf ---`). If extracted text exceeds 30,000 characters, it is cleanly truncated with a notice (`[Document truncated to first 30,000 characters]`).
     - **Image Multimodal Safety:** Attached images are transmitted as OpenAI vision `image_url` data URLs on their originating turn.
     - **Sliding Window:** Up to the last 20 messages are forwarded to the model to stay well within token limits.
   - **Runtime Behavior:**
     - Reads `OPENAI_API_KEY`, `OPENAI_BASE_URL` (defaults to `https://api.openai.com/v1`), and `OPENAI_MODEL` (e.g. `gpt-4o` or compatible reasoning models like `o3-mini`, `deepseek-chat`) from server environment.
     - Connects to provider's `/chat/completions` with `stream: true`.
     - Supports both standard responses and reasoning models (extracting `delta.reasoning_content` or `delta.thinking` separately from `delta.content`).
     - Emits Server-Sent Events (`data: {"content": "...", "reasoning": "..."}\n\n`).
     - Responds to client connection aborts immediately by aborting the upstream fetch request via `AbortController`.

2. **`POST /api/documents/extract`**
   - **Headers:** `Content-Type: multipart/form-data`
   - **Behavior:**
     - Validates file size (≤ 10MB) and format (PDF, DOCX, TXT, MD, CSV).
     - Extracts text content in-memory using PDF and DOCX text extraction utilities (`pdf-parse`, `mammoth`).
     - Returns `{ filename: string, extractedText: string, charCount: number }`.
     - Leaves zero temporary files on the host disk.

---

## 6. Architecture & Implementation Decisions (Builder Review Calls)

1. **`apps/web` Integration:** The Swiss AI Chat application replaces the blank placeholder in `apps/web/src/App.tsx` as the default high-performance interface. The Astryx `AppShell` owns the viewport layout, housing the 280px sidebar and the max 850px reading column.
2. **Model Status & Discovery:** The top header renders a minimal Swiss-styled status pill displaying connection status and active model (e.g. `OPENAI_MODEL` or detected provider from `GET /api/providers`).
3. **Dexie Reactivity:** Reactive updates use `dexie-react-hooks` (`useLiveQuery`) for real-time reactivity when switching conversations, searching titles, or creating threads.
4. **Theme Configuration:** Swiss International palette (`#F8F8F6`, `#FFFFFF`, `#171717`, `#737373`, `#E5E5E3`, `#E53935`) is bound into Astryx CSS custom variables and theme tokens in `apps/web/src/index.css`. No Tailwind CSS.
