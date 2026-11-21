# Database & Persistence Strategy

**Status:** APPROVED FOR PLANNING  
**Version:** 2.0.0  
**Effective Date:** 2026-11-21  
**Document Level:** Level 2 — Technology Specification

---

## 1. Local-First Dual-Layer Persistence

Kantha eliminates cloud database overhead and complex connection pooling in favor of a **local-first, zero-setup persistence model**:

```
+--------------------------------------------------------------------------+
|                     Kantha Persistence Engine                            |
+--------------------------------------------------------------------------+
| Layer 1: Relational State Store (bun:sqlite + Drizzle ORM)               |
| - Sessions, workspaces, checkpoints, tool approvals, system configuration|
| - Embedded WAL-mode SQLite database with sub-millisecond ACID queries     |
+--------------------------------------------------------------------------+
| Layer 2: Chronological Event Stream (Append-Only JSONL)                  |
| - ~/.kantha/sessions/{sessionId}/events.jsonl                            |
| - Unbounded, gap-free event logs for SSE replay, token stream, audit     |
+--------------------------------------------------------------------------+
```

---

## 2. Relational Store: `bun:sqlite` with Drizzle ORM

The primary relational store resides locally at `~/.kantha/kantha.sqlite` (or `.kantha-data/kantha.sqlite` in repository-local mode).

### 2.1 Engine Configuration
At daemon startup, the database is opened with high-concurrency PRAGMA settings:
```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
```
- **WAL Mode (Write-Ahead Logging):** Permits concurrent reads while a write transaction is executing.
- **Synchronous = NORMAL:** Minimizes disk fsync overhead while preserving database integrity in WAL mode.
- **Busy Timeout = 5000ms:** Automatically waits for write locks without throwing busy errors.

### 2.2 Drizzle Schema Architecture (`packages/db`)
All tables are defined declaratively in `packages/db/src/schema.ts`:

```typescript
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  workspacePath: text("workspace_path").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  status: text("status", { enum: ["active", "paused", "completed", "failed"] }).notNull(),
});

export const checkpoints = sqliteTable("checkpoints", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").references(() => sessions.id, { onDelete: "cascade" }),
  generation: integer("generation").notNull(),
  stepIndex: integer("step_index").notNull(),
  stateSnapshot: text("state_snapshot", { mode: "json" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const approvals = sqliteTable("approvals", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").references(() => sessions.id, { onDelete: "cascade" }),
  actionCallId: text("action_call_id").notNull(),
  toolName: text("tool_name").notNull(),
  arguments: text("arguments", { mode: "json" }).notNull(),
  status: text("status", { enum: ["pending", "approved", "rejected"] }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});
```

---

## 3. Chronological Event Stream: Append-Only JSONL

While structured metadata is managed by SQLite, raw conversation steps, streaming LLM delta tokens, and granular tool execution outputs are recorded in **append-only JSONL files**:
- Path: `~/.kantha/sessions/{sessionId}/events.jsonl`
- Format: Each line is a self-contained JSON object validating against `Effect Schema`.

### Advantages of JSONL for Agent Streams:
1. **Zero Database Bloat:** Storing hundreds of thousands of streaming tokens and large diff strings in SQLite causes rapid DB bloat and vacuum requirements. JSONL files stream directly from disk to client.
2. **Deterministic Replay:** On client reconnect or restart, the daemon simply streams lines starting from the client's last acknowledged sequence number.
3. **Crash Resilience:** An unexpected process kill leaves the file intact up to the last flushed line—no transaction rollback or data corruption.
