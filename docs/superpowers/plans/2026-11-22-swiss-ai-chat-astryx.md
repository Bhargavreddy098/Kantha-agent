# Swiss International AI Chat Application Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-quality, responsive AI chat application with a Swiss International Typographic Style design system using Astryx Design components, genuine real-time SSE token streaming, separate reasoning disclosure, multimodal file/document processing, and Dexie IndexedDB local-first storage.

**Architecture:** The application replaces the blank canvas in `apps/web` (Vite + React 19) using Astryx UI primitives (`AppShell`, `ChatLayout`, `ChatMessage`, `ChatComposer`, `Collapsible`, `CodeBlock`) styled via Swiss theme tokens. The backend in `apps/daemon` (Bun HTTP) exposes dedicated endpoints for OpenAI-compatible SSE streaming with reasoning separation and in-memory document parsing (PDF/DOCX) without persistent server files.

**Tech Stack:** React 19, TypeScript, Vite, `@astryxdesign/core`, `@astryxdesign/theme-neutral`, Dexie.js (IndexedDB), Bun, Lucide Icons, react-markdown, remark-gfm.

**Spec:** [`docs/superpowers/specs/2026-11-22-swiss-ai-chat-astryx-design.md`](file:///C:/Users/bharg/OneDrive/Desktop/kantha-agent/docs/superpowers/specs/2026-11-22-swiss-ai-chat-astryx-design.md)

## Global Constraints

- Exclusively use `@astryxdesign/core` and `@astryxdesign/theme-neutral` for UI components.
- Zero Tailwind CSS, utility class frameworks, or shadcn/ui.
- Maintain existing monorepo structure: React 19 + Vite in `apps/web` and Bun in `apps/daemon`.
- Colors: Canvas `#F8F8F6`, Surface `#FFFFFF`, Text `#171717`, Secondary `#737373`, Border `#E5E5E3`, Accent `#E53935` (Swiss red), Hover `#F0F0EE`, Dark mode `#141414`.
- Typography: Helvetica Neue / Inter for body and headings, JetBrains Mono for code.
- File limits: Max 10MB per file, 5 attachments per message, 25MB total payload.
- Server security: All API keys and upstream URLs reside in daemon environment variables (`OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`). Never expose secrets to frontend.
- Zero server file persistence: Documents and images are extracted and discarded in-memory; message history and attachment metadata live in client IndexedDB.

## Review Focus

1. Upstream API rejection when previous assistant `reasoning` is forwarded: Ensure history serialization strips `reasoning` from previous assistant messages before calling `/chat/completions`.
2. Context window overflow on large document attachments: Verify document text is bounded to 30,000 characters with an inline truncation notice.
3. Stream abortion and resource cleanup: Verify clicking Stop aborts the upstream fetch via `AbortController` and leaves partial received tokens intact in Dexie.
4. Multimodal image transmission: Verify attached PNG/JPG/WebP files are formatted as base64 data URLs for OpenAI vision API compatibility.
5. Reactive conversation history updates: Verify creating, renaming, deleting, and selecting conversations in Dexie reflects immediately in the sidebar without requiring page refreshes.

---

### Task 1: Daemon Dependencies and Chat SSE Streaming Service

**Files:**
- Modify: `apps/daemon/package.json`
- Create: `apps/daemon/src/api/chat.ts`
- Modify: `apps/daemon/src/api/router.ts`
- Create: `apps/daemon/src/api/__tests__/chat.test.ts`

**Interfaces:**
- Produces: `POST /api/chat/stream` accepting `{ messages: Array<{ role: string; content: string | Array<any> }>, model?: string }` and returning an SSE stream with events `data: {"content": "...", "reasoning": "..."}\n\n`.

- [ ] **Step 1: Write failing test for chat stream parsing and SSE formatting**

Create `apps/daemon/src/api/__tests__/chat.test.ts` testing:
- Serializing messages while omitting historical `reasoning` fields.
- Parsing streaming SSE chunks from OpenAI format (both `delta.content` and `delta.reasoning_content` / `delta.thinking`).
- Handling client disconnect / abort signals.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test apps/daemon/src/api/__tests__/chat.test.ts`  
Expected: FAIL with module or function not found.

- [ ] **Step 3: Implement `handleChatStreamRequest` in `apps/daemon/src/api/chat.ts`**

Implement streaming handler connecting to upstream OpenAI-compatible endpoint, normalizing reasoning deltas (`reasoning_content` or `thinking`), formatting SSE events, and hooking `req.on("close")` to abort upstream fetch.

- [ ] **Step 4: Register route in `apps/daemon/src/api/router.ts`**

Add `if (pathname === "/api/chat/stream" && req.method === "POST")` under protected router endpoints.

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test apps/daemon/src/api/__tests__/chat.test.ts`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/daemon/package.json apps/daemon/src/api/chat.ts apps/daemon/src/api/router.ts apps/daemon/src/api/__tests__/chat.test.ts
git commit -m "feat(daemon): add OpenAI-compatible SSE chat streaming endpoint with reasoning extraction"
```

---

### Task 2: Daemon Document Text Extraction Service

**Files:**
- Modify: `apps/daemon/package.json`
- Create: `apps/daemon/src/api/documents.ts`
- Modify: `apps/daemon/src/api/router.ts`
- Create: `apps/daemon/src/api/__tests__/documents.test.ts`

**Interfaces:**
- Produces: `POST /api/documents/extract` accepting multipart file uploads and returning `{ filename: string, extractedText: string, charCount: number }`.

- [ ] **Step 1: Install lightweight document parsers in `apps/daemon`**

Install `pdf-parse` and `mammoth` (for docx) in `apps/daemon`.

- [ ] **Step 2: Write failing test for document extraction**

Create `apps/daemon/src/api/__tests__/documents.test.ts` testing extraction of text from plain text/markdown, PDF buffer, and DOCX buffer, enforcing the 10MB limit.

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test apps/daemon/src/api/__tests__/documents.test.ts`  
Expected: FAIL with module not found.

- [ ] **Step 4: Implement document extraction in `apps/daemon/src/api/documents.ts`**

Implement parser handling TXT, MD, CSV directly via UTF-8 decoding, PDF via `pdf-parse`, and DOCX via `mammoth.extractRawText`. Return clean plain text without saving files to disk.

- [ ] **Step 5: Register route in `apps/daemon/src/api/router.ts`**

Add `if (pathname === "/api/documents/extract" && req.method === "POST")`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `bun test apps/daemon/src/api/__tests__/documents.test.ts`  
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/daemon/package.json apps/daemon/src/api/documents.ts apps/daemon/src/api/router.ts apps/daemon/src/api/__tests__/documents.test.ts
git commit -m "feat(daemon): add in-memory PDF and DOCX document text extraction endpoint"
```

---

### Task 3: Client IndexedDB Storage Layer with Dexie

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/src/db/chatDb.ts`
- Create: `apps/web/src/db/useChatHistory.ts`
- Create: `apps/web/src/db/__tests__/chatDb.test.ts`

**Interfaces:**
- Consumes: None
- Produces: `chatDb` (Dexie instance), `useConversations()`, `useMessages(conversationId)`, `createConversation()`, `renameConversation()`, `deleteConversation()`, `saveMessage()`, `updateMessage()`.

- [ ] **Step 1: Install `dexie` and `dexie-react-hooks` in `apps/web`**

Install `dexie` and `dexie-react-hooks`.

- [ ] **Step 2: Write failing test for Dexie chat operations**

Create `apps/web/src/db/__tests__/chatDb.test.ts` testing conversation creation, message saving, reasoning persistence, attachment metadata storage, and title renaming.

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @kantha/web typecheck`  
Expected: FAIL with module missing.

- [ ] **Step 4: Implement Dexie database and helper hooks**

Implement `ChatDatabase` extending `Dexie` with tables `conversations` and `messages`. Export reactive hooks using `useLiveQuery` and time-grouping helper (`groupByDate`: Today, Yesterday, Previous 7 Days, Older).

- [ ] **Step 5: Run tests and typecheck to verify they pass**

Run: `pnpm --filter @kantha/web typecheck`  
Expected: PASS with 0 errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/package.json apps/web/src/db/chatDb.ts apps/web/src/db/useChatHistory.ts apps/web/src/db/__tests__/chatDb.test.ts
git commit -m "feat(web): add Dexie IndexedDB client persistence layer and reactive history hooks"
```

---

### Task 4: Swiss Design System Tokens & Astryx Styling Configuration

**Files:**
- Modify: `apps/web/src/index.css`
- Create: `apps/web/src/theme/swissTheme.ts`

**Interfaces:**
- Produces: Swiss color CSS variables, typography tokens, and Astryx theme definition for light and dark modes.

- [ ] **Step 1: Define Swiss design tokens in `apps/web/src/theme/swissTheme.ts`**

Create palette variables:
- Canvas: `#F8F8F6` / Dark: `#141414`
- Surface: `#FFFFFF` / Dark: `#1F1F1F`
- Text: `#171717` / Dark: `#F5F5F5`
- Secondary: `#737373` / Dark: `#A3A3A3`
- Border: `#E5E5E3` / Dark: `#2E2E2E`
- Accent: `#E53935` (Swiss red)
- Hover: `#F0F0EE` / Dark: `#282828`

- [ ] **Step 2: Apply Swiss typography and global styles in `apps/web/src/index.css`**

Import Inter and JetBrains Mono fonts. Set up 12-column grid variables, hairline 1px borders, smooth 150ms transitions, and respect `prefers-reduced-motion`.

- [ ] **Step 3: Verify clean build and typecheck**

Run: `pnpm --filter @kantha/web typecheck`  
Expected: PASS with 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/theme/swissTheme.ts apps/web/src/index.css
git commit -m "style(web): configure Swiss International Typographic Style tokens and Astryx theme"
```

---

### Task 5: Swiss Editorial Navigation Sidebar

**Files:**
- Create: `apps/web/src/components/Sidebar.tsx`
- Create: `apps/web/src/components/RenameDialog.tsx`
- Create: `apps/web/src/components/DeleteDialog.tsx`

**Interfaces:**
- Consumes: `useConversations()`, `createConversation()`, `renameConversation()`, `deleteConversation()`.
- Produces: `Sidebar` component for Astryx `AppShell`'s `sideNav` slot with search filtering, time-grouped conversation list, Swiss-red active indicators, and theme toggle.

- [ ] **Step 1: Write `Sidebar` component using Astryx primitives**

Use Astryx `Button`, `IconButton`, `Divider`, `ScrollableArea`, and Lucide icons.
- Header: Minimal typographic "KANTHA" logo, New Chat button.
- Search input with clear button.
- Conversation list grouped by Today, Yesterday, Previous 7 Days, Older.
- Active item marked with a vertical 2px `#E53935` Swiss-red left border.
- Contextual menu / actions for Rename and Delete.
- Footer: Light/Dark theme toggle and conversation count metadata.

- [ ] **Step 2: Implement Rename and Delete confirmation dialogs using Astryx `Dialog`**

Ensure accessible keyboard control and focus management.

- [ ] **Step 3: Verify typecheck**

Run: `pnpm --filter @kantha/web typecheck`  
Expected: PASS with 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/Sidebar.tsx apps/web/src/components/RenameDialog.tsx apps/web/src/components/DeleteDialog.tsx
git commit -m "feat(web): add Swiss editorial navigation sidebar with search and dialogs"
```

---

### Task 6: Thinking Panel & Markdown/Code Display Components

**Files:**
- Modify: `apps/web/package.json` (add `react-markdown`, `remark-gfm`)
- Create: `apps/web/src/components/ThinkingPanel.tsx`
- Create: `apps/web/src/components/SwissMarkdown.tsx`

**Interfaces:**
- Consumes: Astryx `Collapsible`, `CodeBlock`.
- Produces: `ThinkingPanel` displaying real-time or completed reasoning, and `SwissMarkdown` rendering sanitized markdown with syntax-highlighted code blocks and copy buttons.

- [ ] **Step 1: Install markdown packages in `apps/web`**

Install `react-markdown` and `remark-gfm`.

- [ ] **Step 2: Implement `ThinkingPanel` using Astryx `Collapsible`**

Render collapsible panel with:
- Uppercase tracking label: "THINKING"
- Thin vertical `#E53935` or `#E5E5E3` accent indicator line
- Subtle `#F0F0EE` background
- Live streaming reasoning text with active pulse dot
- Expand/collapse toggle chevron

- [ ] **Step 3: Implement `SwissMarkdown` component**

Render markdown elements adhering to Swiss editorial layout (strong typographic hierarchy, clean tables, hairline horizontal rules). Map code blocks to Astryx `CodeBlock` with copy buttons and language labels.

- [ ] **Step 4: Verify typecheck**

Run: `pnpm --filter @kantha/web typecheck`  
Expected: PASS with 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json apps/web/src/components/ThinkingPanel.tsx apps/web/src/components/SwissMarkdown.tsx
git commit -m "feat(web): add Astryx Collapsible thinking panel and Swiss markdown renderer"
```

---

### Task 7: Chat Composer with Multimodal & Document Attachments

**Files:**
- Create: `apps/web/src/components/Composer.tsx`
- Create: `apps/web/src/components/AttachmentChip.tsx`
- Create: `apps/web/src/services/documentService.ts`

**Interfaces:**
- Consumes: Astryx `ChatComposer`, `ChatComposerDrawer`, `Button`, `IconButton`.
- Produces: `Composer` handling multiline input, Enter-to-send, Shift+Enter newline, stop generation button, drag-and-drop file upload, file validation, and document text extraction.

- [ ] **Step 1: Implement `documentService.ts`**

Function `extractDocumentText(file: File)` calling `/api/documents/extract` for PDF/DOCX/TXT and returning extracted text. Function `readImageAsDataUrl(file: File)` for image previews.

- [ ] **Step 2: Implement `Composer.tsx` using Astryx `ChatComposer`**

Use `elevation="none"` with subtle 1px border.
- Slot `drawer`: Render `AttachmentChip` list showing image thumbnails, document icons, file sizes, and remove buttons.
- Slot `footerActions`: Attachment upload button and hidden file input with accepted MIME types.
- Drag-and-drop overlay with subtle border highlight.
- Send button toggles to Stop button when generating (`isStopShown={isGenerating}`).

- [ ] **Step 3: Verify typecheck**

Run: `pnpm --filter @kantha/web typecheck`  
Expected: PASS with 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/Composer.tsx apps/web/src/components/AttachmentChip.tsx apps/web/src/services/documentService.ts
git commit -m "feat(web): add Astryx chat composer with multimodal attachments and drag-and-drop"
```

---

### Task 8: Main Workspace, Welcome Screen & Streaming Integration

**Files:**
- Create: `apps/web/src/components/WelcomeScreen.tsx`
- Create: `apps/web/src/components/MessageItem.tsx`
- Create: `apps/web/src/components/ChatWorkspace.tsx`
- Modify: `apps/web/src/App.tsx`
- Create: `apps/web/src/services/chatStreamService.ts`

**Interfaces:**
- Consumes: All components from Tasks 3–7, Astryx `AppShell`, `ChatLayout`.
- Produces: Complete working Swiss AI Chat Application in `apps/web/src/App.tsx`.

- [ ] **Step 1: Implement `chatStreamService.ts`**

Implement SSE stream reader connecting to `/api/chat/stream`. Emits parsed chunks (`onToken`, `onReasoning`, `onError`, `onComplete`). Integrates with `AbortController`.

- [ ] **Step 2: Implement `WelcomeScreen.tsx`**

Swiss typography layout:
- Large bold heading: "What would you like to explore?"
- Editorial subtext
- Clickable suggestion prompt cards ("Explain quantum computing in simple terms", "Review this code architecture", "Summarize an uploaded document") that populate or trigger the composer.

- [ ] **Step 3: Implement `MessageItem.tsx`**

Using Astryx `ChatMessage` and `ChatMessageBubble` (`variant="ghost"`, `width="100%"`):
- User message with attached image thumbnails or document badges.
- Assistant message rendering `ThinkingPanel` (if reasoning present) followed by `SwissMarkdown`.
- Message actions: Copy message, Regenerate.

- [ ] **Step 4: Implement `ChatWorkspace.tsx` and integrate in `App.tsx`**

Wire `AppShell` with `Sidebar` in `sideNav`, top header with title and model status, `ChatLayout` with `ChatMessageList` and `Composer`. Connect real-time streaming state, autoscroll with `useChatStreamScroll`, and Dexie persistence.

- [ ] **Step 5: Verify typecheck and production build**

Run: `pnpm -r typecheck && pnpm -r build`  
Expected: PASS with 0 errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/WelcomeScreen.tsx apps/web/src/components/MessageItem.tsx apps/web/src/components/ChatWorkspace.tsx apps/web/src/services/chatStreamService.ts apps/web/src/App.tsx
git commit -m "feat(web): complete Swiss AI Chat application with real streaming, reasoning, and Dexie storage"
```

---

### Task 9: Full End-to-End Verification & Documentation Update

**Files:**
- Modify: `docs/CURRENT_STATE.md`
- Verify: Full test suite, linting, build, and responsive behavior.

- [ ] **Step 1: Run comprehensive monorepo verification**

Run: `pnpm -r typecheck && pnpm -r test && pnpm -r build`  
Expected: All packages pass with zero errors.

- [ ] **Step 2: Update `docs/CURRENT_STATE.md`**

Document the Swiss International AI Chat application in `apps/web`, Astryx component architecture, Dexie storage, and daemon endpoints.

- [ ] **Step 3: Final Commit**

```bash
git add docs/CURRENT_STATE.md
git commit -m "docs: update development state for Swiss AI Chat Astryx implementation"
```
