import * as schema from "./schema";
import path from "node:path";
import fs from "node:fs";

export * from "./schema";

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
    db = drizzle(sqlite, { schema });
  } else {
    // Node.js fallback using node:sqlite
    try {
      const { DatabaseSync } = await import("node:sqlite");
      sqlite = sqlite || new DatabaseSync(dbPath);
      sqlite.exec("PRAGMA journal_mode = WAL;");
      sqlite.exec("PRAGMA synchronous = NORMAL;");
      sqlite.exec("PRAGMA foreign_keys = ON;");
      sqlite.exec("PRAGMA busy_timeout = 5000;");
    } catch {
      // In-memory or mock
    }
  }

  return { db, sqlite, dbPath };
}

export type KanthaDatabase = Awaited<ReturnType<typeof createKanthaDb>>;
