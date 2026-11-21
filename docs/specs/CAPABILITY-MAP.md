# Capability Map: Kantha Autonomous Coding Engine

**Initiative:** Full Coding Agent Engine Modernization  
**Governance Standard:** Spec-Driven Development (Phase 0 Scope Decomposition)  
**Parent Strategy:** Stack Parity with OpenCode & Claude Code  
**Date:** 2026-11-21  

---

## 1. Overview & Capability Decomposition

To transition Kantha from a conversational gateway into a battle-tested autonomous coding assistant, the architecture decomposes into six independently testable, decoupled modules:

| Module ID | Capability & Responsibility | Key Dependencies / Technologies | Upstream Dependencies |
|---|---|---|---|
| `tool-contracts` | **Schemas, Tools & MCP:** Typed Zod runtime validation for all tool definitions, JSON-schema generation, and Model Context Protocol (MCP) client connection handling. | `zod`, `@modelcontextprotocol/sdk` | — |
| `code-search` | **Fast Codebase Search & AST:** High-performance regex grep honoring `.gitignore`, fast file tree discovery, and AST symbol extraction for token-efficient repo mapping. | `ripgrep` (spawn), `fast-glob`, `ignore`, `web-tree-sitter` | `tool-contracts` |
| `file-editor` | **Surgical File Editing & Diffs:** String replacement, unified patch generation, line-level diff calculation, visual diff preview tokens, and atomic Git staging. | `diff` (`jsdiff`), `@pierre/diffs` / Shiki, `simple-git` | `tool-contracts` |
| `pty-terminal` | **Interactive Terminal & File Watching:** Full PTY streaming execution for interactive commands, dev servers, ANSI parsing, and external workspace file change detection. | `node-pty`, `@xterm/xterm`, `chokidar` | `tool-contracts` |
| `context-budget` | **Context Compaction & Token Truncation:** Hard token truncation for noisy outputs, token budgeting per attempt, and semantic history auto-compaction at 70–80% context window. | `js-tiktoken`, Gateway UsageService | `tool-contracts` |
| `kiri-sandbox` | **Execution Sandbox & OS Boundary:** Lightweight Rust microVM container runtime isolation via Docker Engine API; enforces kernel barriers, credential protection, and resource limits. | `kiri` runtime, `dockerode`, Git worktree | `tool-contracts` |

---

## 2. Dependency Graph & Build Order

```
[tool-contracts] (Zod Schemas & MCP Primitives)
       │
       ├───────────────────┬───────────────────┬───────────────────┐
       ▼                   ▼                   ▼                   ▼
[code-search]       [file-editor]       [context-budget]    [kiri-sandbox]
(Ripgrep + AST)    (Surgical Diffs)     (Compaction)       (Kiri MicroVM)
                                                                   │
                                                                   ▼
                                                            [pty-terminal]
                                                          (PTY inside Kiri)
```

**Recommended Build & Specification Order:**
1. `tool-contracts` (Foundation for typed arguments across all capabilities)
2. `kiri-sandbox` *(Active Spec — Target of user directive: "use kiri for sandbox")*
3. `code-search` (Read-only codebase discovery tools)
4. `file-editor` (Mutating file editing and diff verification)
5. `pty-terminal` (Execution driver embedded within the sandbox)
6. `context-budget` (Context optimization and compaction engine)
