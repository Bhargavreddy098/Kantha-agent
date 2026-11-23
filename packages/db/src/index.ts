import * as schema from "./schema";
import path from "node:path";
import fs from "node:fs";

export * from "./schema";
export { eq, and, sql, desc, asc } from "drizzle-orm";

export const DDL_SCHEMA = `
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    workspace_path TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'idle',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS checkpoints (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    generation INTEGER NOT NULL,
    step_index INTEGER NOT NULL,
    state_snapshot TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS approvals (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    call_id TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    args TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS session_events (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    sequence INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS gateway_secrets (
    id TEXT PRIMARY KEY,
    ciphertext TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS usage_ledger (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    turn_id TEXT,
    provider_id TEXT NOT NULL,
    model_id TEXT NOT NULL,
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    reasoning_tokens INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens INTEGER NOT NULL DEFAULT 0,
    cache_write_5m_tokens INTEGER NOT NULL DEFAULT 0,
    cache_write_1h_tokens INTEGER NOT NULL DEFAULT 0,
    cost_usd REAL NOT NULL,
    estimated INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    timestamp INTEGER NOT NULL
  );
`;

export interface KanthaDbOptions {
  dbPath?: string;
  sqlite?: any;
}

/**
 * Initializes the local SQLite database in WAL mode using Drizzle ORM.
 * Supports Bun runtime (native bun:sqlite) with Node.js fallback.
 */
export async function createKanthaDb(options: KanthaDbOptions = {}) {
  const defaultDir = process.env.KANTHA_DATA_DIR || path.resolve(process.cwd(), ".kantha-data");
  if (!fs.existsSync(defaultDir)) {
    fs.mkdirSync(defaultDir, { recursive: true });
  }

  const dbPath = options.dbPath || path.join(defaultDir, "kantha.sqlite");
  let db: any = null;
  let sqlite: any = options.sqlite || null;

  if (typeof (process.versions as any)?.bun !== "undefined") {
    // Bun native high-performance runtime
    const { Database } = await import("bun:sqlite" as any);
    const { drizzle } = await import("drizzle-orm/bun-sqlite");
    sqlite = sqlite || new Database(dbPath);
    sqlite.exec("PRAGMA journal_mode = WAL;");
    sqlite.exec("PRAGMA synchronous = NORMAL;");
    sqlite.exec("PRAGMA foreign_keys = ON;");
    sqlite.exec("PRAGMA busy_timeout = 5000;");
    sqlite.exec(DDL_SCHEMA);
    db = drizzle(sqlite, { schema });
  }

  if (!db) {
    throw new Error(
      "Failed to initialize Kantha database: SQLite database driver could not be loaded. Please ensure you are running under Bun runtime (bun run or bun --watch)."
    );
  }

  return { db, sqlite, dbPath };
}

export type KanthaDatabase = Awaited<ReturnType<typeof createKanthaDb>>;
