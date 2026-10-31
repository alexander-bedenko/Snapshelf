/**
 * @jest-environment node
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { migrate } from '@/data/migrations';
import { SqliteRepository } from '@/data/SqliteRepository';
import { createSqlDb, type RawDb, type SqlDb, type SqlValue } from '@/data/sql';

/** node:sqlite driver for tests (the device uses expo-sqlite behind the same RawDb). */
export function rawFromNode(database: DatabaseSync): RawDb {
  return {
    async exec(sql) {
      database.exec(sql);
    },
    async run(sql, params: SqlValue[]) {
      const result = database.prepare(sql).run(...params);
      return { changes: Number(result.changes) };
    },
    async all(sql, params: SqlValue[]) {
      return database.prepare(sql).all(...params);
    },
    async close() {
      database.close();
    },
  };
}

export async function openTestDb(path = ':memory:', targetVersion?: number): Promise<SqlDb> {
  const db = createSqlDb(rawFromNode(new DatabaseSync(path)));
  await db.exec('PRAGMA foreign_keys = ON');
  await migrate(db, undefined, targetVersion);
  return db;
}

export async function openTestRepo(): Promise<{ db: SqlDb; repo: SqliteRepository }> {
  const db = await openTestDb();
  return { db, repo: new SqliteRepository(db) };
}

export function tempDbPath(): string {
  return join(mkdtempSync(join(tmpdir(), 'snapshelf-')), 'test.db');
}
