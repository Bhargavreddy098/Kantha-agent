import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { GatewayConnection } from '../../contracts/connection';
import type { GatewaySession } from '../../contracts/session';
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

export type Collection =
  | 'secrets'
  | 'connections'
  | 'sessions'
  | 'runs'
  | 'submissions'
  | 'approvals'
  | 'audit'
  | 'metadata'
  | 'attempts'
  | 'harness_admissions'
  | 'harness_submissions'
  | 'harness_checkpoints'
  | 'harness_claims'
  | 'harness_journals'
  | 'harness_workspaces'
  | 'harness_actions';

const eventLimit = 512;

export const defaultDatabasePath = '.gateway-data/gateway.sqlite';

export class GatewayDatabase {
  private readonly db: SqlDatabase;
  readonly path: string;
  private readonly statements = new Map<string, SqlStatement>();
  private readonly connectionLists = new Map<string, GatewayConnection[]>();
  private dataVersion: SqlValue | undefined;
  private writing = false;

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
        CREATE INDEX IF NOT EXISTS gateway_documents_by_order
          ON gateway_documents (collection, scope, timestamp, id);
        DROP INDEX IF EXISTS gateway_documents_by_time;
        CREATE TABLE IF NOT EXISTS gateway_events (
          scope TEXT NOT NULL,
          session_id TEXT NOT NULL,
          sequence INTEGER NOT NULL,
          value TEXT NOT NULL,
          PRIMARY KEY (scope, session_id, sequence)
        );
        CREATE TABLE IF NOT EXISTS gateway_jobs (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          payload TEXT NOT NULL,
          status TEXT NOT NULL,
          scheduled_at INTEGER NOT NULL
        );
      `);
    } catch (error) {
      this.db.close();
      throw error;
    }
  }

  write<T>(operation: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    this.writing = true;
    try {
      const result = operation();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    } finally {
      this.writing = false;
    }
  }

  private prepare(sql: string): SqlStatement {
    const cached = this.statements.get(sql);
    if (cached) return cached;
    const statement = this.db.prepare(sql);
    this.statements.set(sql, statement);
    return statement;
  }

  check(): boolean {
    this.prepare('SELECT 1 FROM gateway_documents LIMIT 1').get();
    return true;
  }

  close(): void {
    this.db.close();
  }

  get<T>(collection: Collection, scope: string, id: string): T | null {
    const row = this.prepare(
      'SELECT value FROM gateway_documents WHERE collection = ? AND scope = ? AND id = ?'
    ).get(collection, scope, id);

    return row ? JSON.parse(String(row.value)) as T : null;
  }

  getMany<T>(collection: Collection, scope: string, ids: string[]): Map<string, T> {
    if (!ids.length) return new Map();
    const rows = this.prepare(`
      SELECT id, value FROM gateway_documents
      WHERE collection = ? AND scope = ? AND id IN (SELECT value FROM json_each(?))
    `).all(collection, scope, JSON.stringify(ids));
    return new Map(rows.map((row) => [String(row.id), JSON.parse(String(row.value)) as T]));
  }

  listConnections(scope: string): GatewayConnection[] {
    if (this.writing) return this.list('connections', scope);
    // Local writes invalidate the workspace. data_version detects commits on other handles.
    const version = this.prepare('PRAGMA data_version').get()?.data_version;
    if (version !== this.dataVersion) {
      this.connectionLists.clear();
      this.dataVersion = version;
    }
    const cached = this.connectionLists.get(scope);
    if (cached) return structuredClone(cached);

    const rows = this.listRows('connections', scope, 0, Number.MAX_SAFE_INTEGER);
    const connections = rows.map((row) => JSON.parse(String(row.value)) as GatewayConnection);
    if (rows.reduce((size, row) => size + String(row.value).length, 0) <= 256_000) {
      if (this.connectionLists.size >= 8) {
        const oldest = this.connectionLists.keys().next().value;
        if (oldest !== undefined) this.connectionLists.delete(oldest);
      }
      this.connectionLists.set(scope, structuredClone(connections));
    }
    return connections;
  }

  getSessionMetadata(scope: string, id: string): GatewaySession | null {
    const row = this.prepare(`
      SELECT json_extract(value, '$.session') AS value FROM gateway_documents
      WHERE collection = 'sessions' AND scope = ? AND id = ?
    `).get(scope, id);
    return row ? JSON.parse(String(row.value)) as GatewaySession : null;
  }

  listSessionMetadata(scope: string, limit = -1, offset = 0): GatewaySession[] {
    return this.prepare(`
      SELECT json_extract(value, '$.session') AS value FROM gateway_documents
      WHERE collection = 'sessions' AND scope = ? AND timestamp >= 0 AND timestamp < ?
      AND json_extract(value, '$.session.status') <> 'deleted'
      ORDER BY timestamp DESC, id DESC LIMIT ? OFFSET ?
    `).all(scope, Number.MAX_SAFE_INTEGER, limit, offset)
      .map((row) => JSON.parse(String(row.value)) as GatewaySession);
  }

  list<T>(collection: Collection, scope: string, since = 0, until = Number.MAX_SAFE_INTEGER): T[] {
    return this.listRows(collection, scope, since, until).map((row) => JSON.parse(String(row.value)) as T);
  }

  private listRows(collection: Collection, scope: string, since: number, until: number): SqlRow[] {
    return this.prepare(`
      SELECT value FROM gateway_documents
      WHERE collection = ? AND scope = ? AND timestamp >= ? AND timestamp < ?
      ORDER BY timestamp DESC, id DESC
    `).all(collection, scope, since, until);
  }

  put<T>(collection: Collection, scope: string, id: string, value: T, timestamp = Date.now()): void {
    this.prepare(`
      INSERT INTO gateway_documents (collection, scope, id, value, timestamp)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (collection, scope, id) DO UPDATE SET value = excluded.value, timestamp = excluded.timestamp
    `).run(collection, scope, id, JSON.stringify(value), timestamp);
    if (collection === 'connections') this.connectionLists.delete(scope);
  }

  delete(collection: Collection, scope: string, id: string): boolean {
    const deleted = Number(this.prepare(
      'DELETE FROM gateway_documents WHERE collection = ? AND scope = ? AND id = ?'
    ).run(collection, scope, id).changes) > 0;
    if (deleted && collection === 'connections') this.connectionLists.delete(scope);
    return deleted;
  }

  eventBounds(scope: string, sessionId: string): { oldest: number; latest: number } {
    const row = this.prepare(`
      SELECT min(sequence) AS oldest, max(sequence) AS latest
      FROM gateway_events WHERE scope = ? AND session_id = ?
    `).get(scope, sessionId);
    return { oldest: Number(row?.oldest ?? 0), latest: Number(row?.latest ?? 0) };
  }

  readEvents(scope: string, sessionId: string, cursor: number, limit: number): GatewayEvent[] {
    return this.prepare(`
      SELECT value FROM gateway_events
      WHERE scope = ? AND session_id = ? AND sequence > ?
      ORDER BY sequence LIMIT ?
    `).all(scope, sessionId, cursor, limit).map((row) => JSON.parse(String(row.value)) as GatewayEvent);
  }

  deleteSessionEvents(scope: string, sessionId: string): void {
    this.prepare('DELETE FROM gateway_events WHERE scope = ? AND session_id = ?').run(scope, sessionId);
  }

  // The caller writes the corresponding state and event in the same transaction.
  appendEvent(scope: string, event: GatewayEvent): GatewayEvent {
    const sequence = this.eventBounds(scope, event.sessionId).latest + 1;
    const recorded = { ...event, sequence };
    this.prepare('INSERT INTO gateway_events (scope, session_id, sequence, value) VALUES (?, ?, ?, ?)')
      .run(scope, event.sessionId, sequence, JSON.stringify(recorded));
    if (sequence > eventLimit) {
      this.prepare('DELETE FROM gateway_events WHERE scope = ? AND session_id = ? AND sequence <= ?')
        .run(scope, event.sessionId, sequence - eventLimit);
    }
    return recorded;
  }
}
