/**
 * @jest-environment node
 */
import { getSchemaVersion, LATEST_VERSION, migrate, MIGRATIONS } from '@/data/migrations';
import { openTestDb, tempDbPath } from '../helpers/nodeSqlite';

async function tableNames(db: Awaited<ReturnType<typeof openTestDb>>): Promise<string[]> {
  const rows = await db.all<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type IN ('table', 'trigger') ORDER BY name`,
  );
  return rows.map((r) => r.name);
}

describe('migrations', () => {
  it('builds the full schema from an empty database', async () => {
    const db = await openTestDb();

    expect(await getSchemaVersion(db)).toBe(LATEST_VERSION);
    const names = await tableNames(db);
    expect(names).toEqual(
      expect.arrayContaining([
        'screenshots',
        'entities',
        'screenshots_fts',
        'screenshots_ai',
        'screenshots_ad',
        'screenshots_au',
      ]),
    );
    const cols = await db.all<{ name: string }>('PRAGMA table_info(screenshots)');
    expect(cols.map((c) => c.name)).toEqual(
      expect.arrayContaining([
        'id',
        'uri',
        'taken_at',
        'status',
        'ocr_text',
        'attempts',
        'next_retry_at',
      ]),
    );
  });

  it('upgrades from the previous version and keeps data and the search index', async () => {
    const path = tempDbPath();
    const v1 = await openTestDb(path, 1);
    expect(await getSchemaVersion(v1)).toBe(1);
    await v1.run(
      `INSERT INTO screenshots (id, uri, taken_at, status, ocr_text) VALUES ('a', 'u', 5, 'done', 'молоко')`,
    );
    await v1.close();

    const upgraded = await openTestDb(path);

    expect(await getSchemaVersion(upgraded)).toBe(LATEST_VERSION);
    const [row] = await upgraded.all<{
      id: string;
      ocr_text: string;
      attempts: number;
      next_retry_at: null;
    }>('SELECT id, ocr_text, attempts, next_retry_at FROM screenshots');
    expect(row).toEqual({ id: 'a', ocr_text: 'молоко', attempts: 0, next_retry_at: null });
    const hits = await upgraded.all(
      `SELECT rowid FROM screenshots_fts WHERE screenshots_fts MATCH 'молоко'`,
    );
    expect(hits).toHaveLength(1);
  });

  it('v3 moves the search index to folded text, so existing rows are found without ł/ё', async () => {
    const path = tempDbPath();
    const v2 = await openTestDb(path, 2);
    await v2.run(
      `INSERT INTO screenshots (id, uri, taken_at, status, ocr_text)
       VALUES ('a', 'u', 5, 'done', 'Żółw łączy się z Łodzią'), ('b', 'u', 6, 'pending', NULL),
              ('c', 'u', 7, 'done', 'Всё ЁЛКИ')`,
    );
    await v2.close();

    const upgraded = await openTestDb(path);

    const rows = await upgraded.all<{ id: string; search_text: string | null }>(
      'SELECT id, search_text FROM screenshots ORDER BY id',
    );
    expect(rows).toEqual([
      { id: 'a', search_text: 'Żólw lączy się z Lodzią' },
      { id: 'b', search_text: null },
      { id: 'c', search_text: 'Все ЕЛКИ' },
    ]);
    const hits = await upgraded.all(
      `SELECT rowid FROM screenshots_fts WHERE screenshots_fts MATCH 'zolw lodzia'`,
    );
    expect(hits).toHaveLength(1);
    const yo = await upgraded.all(
      `SELECT rowid FROM screenshots_fts WHERE screenshots_fts MATCH 'елки'`,
    );
    expect(yo).toHaveLength(1);
  });

  it('is idempotent when run again on an up-to-date database', async () => {
    const db = await openTestDb();
    expect(await migrate(db)).toBe(LATEST_VERSION);
  });

  it('refuses to open a database written by a newer app version', async () => {
    const db = await openTestDb();
    await db.exec(`PRAGMA user_version = ${LATEST_VERSION + 1}`);
    await expect(migrate(db)).rejects.toThrow('newer than the app');
  });

  it('rolls a failed migration back and keeps the previous version', async () => {
    const db = await openTestDb(':memory:', 1);
    const broken = [
      ...MIGRATIONS.slice(0, 1),
      {
        version: 2,
        sql: 'ALTER TABLE screenshots ADD COLUMN attempts INTEGER; SELECT nonsense FROM nowhere;',
      },
    ];

    await expect(migrate(db, broken)).rejects.toThrow();

    expect(await getSchemaVersion(db)).toBe(1);
    const cols = await db.all<{ name: string }>('PRAGMA table_info(screenshots)');
    expect(cols.map((c) => c.name)).not.toContain('attempts');
  });

  it('keeps contiguous, increasing versions', () => {
    expect(MIGRATIONS.map((m) => m.version)).toEqual(MIGRATIONS.map((_, i) => i + 1));
  });
});
