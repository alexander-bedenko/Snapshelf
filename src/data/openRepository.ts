import { openDatabaseAsync } from 'expo-sqlite';

import { LATEST_VERSION, migrate } from './migrations';
import { SqliteRepository } from './SqliteRepository';
import { createSqlDb, type SqlValue } from './sql';

export const DATABASE_NAME = 'snapshelf.db';

export async function openRepository(name = DATABASE_NAME): Promise<SqliteRepository> {
  const native = await openDatabaseAsync(name);
  const db = createSqlDb({
    exec: (sql) => native.execAsync(sql),
    run: async (sql, params: SqlValue[]) => {
      const result = await native.runAsync(sql, params);
      return { changes: result.changes };
    },
    all: (sql, params: SqlValue[]) => native.getAllAsync(sql, params),
    close: () => native.closeAsync(),
  });
  await db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const version = await migrate(db);
  if (version !== LATEST_VERSION) throw new Error(`Unexpected schema version ${version}`);
  return new SqliteRepository(db);
}
