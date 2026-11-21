# ADR-003: Adopt Local-First bun:sqlite, Drizzle ORM, and JSONL Event Streaming

**Status:** ACCEPTED FOR PLANNING  
**Date:** 2026-11-21  
**Deciders:** Principal Software Architect, Database Architect  
**Technical Area:** Persistence & Database Architecture

---

## Context
Earlier architecture proposed dual-storage: local SQLite for dev and a managed cloud database (Neon PostgreSQL + pg-boss) for production.

However, an autonomous coding agent is predominantly a **local-first developer tool** running on the user's workstation. Introducing a cloud database requirement:
1. Creates mandatory network dependencies and internet connectivity requirements.
2. Complicates local setup (requires API keys, connection string provisioning, cloud costs).
3. Adds network latency to every single token and event write transaction.

---

## Decision
1. **Local-First Architecture:** Eliminate the external cloud database dependency. Standardize on **`bun:sqlite`** embedded directly in the daemon process.
2. **Drizzle ORM for Relational State:**
   - Use **Drizzle ORM** (`drizzle-orm/bun-sqlite`) for type-safe relational schemas (sessions, workspaces, checkpoints, tool approvals, configurations).
   - Configure SQLite in high-performance Write-Ahead Logging mode (`PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL`).
3. **Append-Only JSONL Event Stream:**
   - Store detailed execution steps, streaming tokens, tool diffs, and verification logs in per-session append-only JSONL files (`~/.kantha/sessions/{sessionId}/events.jsonl`).
   - Enables instantaneous SSE replay upon client reconnection without database query bloat or vacuum overhead.

---

## Consequences
### Positive
- **Zero Cloud Setup:** Works immediately out of the box with zero external configuration or credentials.
- **Blazing Performance:** Local SQLite transactions and append-only file writes execute in sub-millisecond time.
- **Portability:** Sessions and projects are completely self-contained in the local filesystem.

### Negative
- Multi-user remote collaboration requires synchronizing local states or using a network relay if added in future phases.
