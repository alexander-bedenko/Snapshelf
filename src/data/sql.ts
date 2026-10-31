export type SqlValue = string | number | null;

export interface SqlExecutor {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlValue[]): Promise<{ changes: number }>;
  all<T = Record<string, unknown>>(sql: string, params?: SqlValue[]): Promise<T[]>;
}

export interface SqlDb extends SqlExecutor {
  /**
   * Runs `fn` in one transaction. Use only the `tx` passed to `fn` inside it:
   * calling the outer db from within would wait for the transaction forever.
   */
  transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** Minimal driver surface; implemented by expo-sqlite (device) and node:sqlite (tests). */
export interface RawDb {
  exec(sql: string): Promise<void>;
  run(sql: string, params: SqlValue[]): Promise<{ changes: number }>;
  all(sql: string, params: SqlValue[]): Promise<unknown[]>;
  close(): Promise<void>;
}

/**
 * Wraps a driver so that statements and transactions never interleave on the single
 * connection: concurrent pipeline workers would otherwise issue nested BEGINs.
 */
export function createSqlDb(raw: RawDb): SqlDb {
  let queue: Promise<unknown> = Promise.resolve();

  function serialized<T>(task: () => Promise<T>): Promise<T> {
    const result = queue.then(task, task);
    queue = result.catch(() => undefined);
    return result;
  }

  const direct: SqlExecutor = {
    exec: (sql) => raw.exec(sql),
    run: (sql, params = []) => raw.run(sql, params),
    all: async <T>(sql: string, params: SqlValue[] = []) => (await raw.all(sql, params)) as T[],
  };

  return {
    exec: (sql) => serialized(() => direct.exec(sql)),
    run: (sql, params) => serialized(() => direct.run(sql, params)),
    all: <T>(sql: string, params?: SqlValue[]) => serialized(() => direct.all<T>(sql, params)),
    transaction: <T>(fn: (tx: SqlExecutor) => Promise<T>) =>
      serialized(async () => {
        await raw.exec('BEGIN IMMEDIATE');
        try {
          const result = await fn(direct);
          await raw.exec('COMMIT');
          return result;
        } catch (error) {
          try {
            await raw.exec('ROLLBACK');
          } catch {
            // the original error is the useful one
          }
          throw error;
        }
      }),
    close: () => serialized(() => raw.close()),
  };
}
