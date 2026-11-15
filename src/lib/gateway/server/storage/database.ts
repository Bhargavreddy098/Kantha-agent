import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { GatewayEvent } from '../../contracts/event';

type SqlValue = number | string | null;
type SqlRow = Record<string, SqlValue>;

interface SqlStatement {
  get(...values: SqlValue[]): SqlRow | undefined;
  all(...values: SqlValue[]): SqlRow[];
  run(...values: SqlValue[]): { changes: number | bigint };
}

interface SqlDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqlStatement;
  close(): void;
}

type Collection = 'secrets' | 'connections' | 'sessions' | 'runs' | 'submissions' | 'approvals' | 'audit' | 'metadata' | 'attempts';

const eventLimit = 512;

export const defaultDatabasePath = '.gateway-data/gateway.sqlite';

export class GatewayDatabase {
  private readonly db: SqlDatabase;
  readonly path: string;

  constructor(path: string) {
    this.path = path === ':memory:' ? path : resolve(path);
    if (this.path !== ':memory:') mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
    const sqlite = process.getBuiltinModule('node:sqlite') as
      | { DatabaseSync: new (location: string) => SqlDatabase }
      | undefined;
    if (!sqlite) throw new Error('The gateway requires a Node.js runtime with node:sqlite.');

    this.db = new sqlite.DatabaseSync(this.path);
    try {
      this.db.exec(`
        PRAGMA busy_timeout = 5000;
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = FULL;
        CREATE TABLE IF NOT EXISTS gateway_documents (
          collection TEXT NOT NULL,
          scope TEXT NOT NULL,
          id TEXT NOT NULL,
          value TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          PRIMARY KEY (collection, scope, id)
        );
        CREATE INDEX IF NOT EXISTS gateway_documents_by_time
          ON gateway_documents (collection, scope, timestamp);
        CREATE TABLE IF NOT EXISTS gateway_events (
          scope TEXT NOT NULL,
          session_id TEXT NOT NULL,
          sequence INTEGER NOT NULL,
          value TEXT NOT NULL,
          PRIMARY KEY (scope, session_id, sequence)
        );
      `);
    } catch (error) {
      this.db.close();
      throw error;
    }
  }

  write<T>(operation: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = operation();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  check(): boolean {
    this.db.prepare('SELECT 1 FROM gateway_documents LIMIT 1').get();
    return true;
  }

  close(): void {
    this.db.close();
  }

  get<T>(collection: Collection, scope: string, id: string): T | null {
    const row = this.db.prepare(
      'SELECT value FROM gateway_documents WHERE collection = ? AND scope = ? AND id = ?'
    ).get(collection, scope, id);
    return row ? JSON.parse(String(row.value)) as T : null;
  }

  list<T>(collection: Collection, scope: string, since = 0, until = Number.MAX_SAFE_INTEGER): T[] {
    return this.db.prepare(`
      SELECT value FROM gateway_documents
      WHERE collection = ? AND scope = ? AND timestamp >= ? AND timestamp < ?
      ORDER BY timestamp DESC, id DESC
    `).all(collection, scope, since, until).map((row) => JSON.parse(String(row.value)) as T);
  }

  put<T>(collection: Collection, scope: string, id: string, value: T, timestamp = Date.now()): void {
    this.db.prepare(`
      INSERT INTO gateway_documents (collection, scope, id, value, timestamp)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (collection, scope, id) DO UPDATE SET value = excluded.value, timestamp = excluded.timestamp
    `).run(collection, scope, id, JSON.stringify(value), timestamp);
  }

  delete(collection: Collection, scope: string, id: string): boolean {
    return Number(this.db.prepare(
      'DELETE FROM gateway_documents WHERE collection = ? AND scope = ? AND id = ?'
    ).run(collection, scope, id).changes) > 0;
  }

  eventBounds(scope: string, sessionId: string): { oldest: number; latest: number } {
    const row = this.db.prepare(`
      SELECT min(sequence) AS oldest, max(sequence) AS latest
      FROM gateway_events WHERE scope = ? AND session_id = ?
    `).get(scope, sessionId);
    return { oldest: Number(row?.oldest ?? 0), latest: Number(row?.latest ?? 0) };
  }

  readEvents(scope: string, sessionId: string, cursor: number, limit: number): GatewayEvent[] {
    return this.db.prepare(`
      SELECT value FROM gateway_events
      WHERE scope = ? AND session_id = ? AND sequence > ?
      ORDER BY sequence LIMIT ?
    `).all(scope, sessionId, cursor, limit).map((row) => JSON.parse(String(row.value)) as GatewayEvent);
  }

  deleteSessionEvents(scope: string, sessionId: string): void {
    this.db.prepare('DELETE FROM gateway_events WHERE scope = ? AND session_id = ?').run(scope, sessionId);
  }

  // The caller writes the corresponding state and event in the same transaction.
  appendEvent(scope: string, event: GatewayEvent): GatewayEvent {
    const sequence = this.eventBounds(scope, event.sessionId).latest + 1;
    const recorded = { ...event, sequence };
    this.db.prepare('INSERT INTO gateway_events (scope, session_id, sequence, value) VALUES (?, ?, ?, ?)')
      .run(scope, event.sessionId, sequence, JSON.stringify(recorded));
    if (sequence > eventLimit) {
      this.db.prepare('DELETE FROM gateway_events WHERE scope = ? AND session_id = ? AND sequence <= ?')
        .run(scope, event.sessionId, sequence - eventLimit);
    }
    return recorded;
  }
}
