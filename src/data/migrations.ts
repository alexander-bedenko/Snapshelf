import type { SqlDb } from './sql';

export type Migration = { version: number; sql: string };

// v1 is the schema from CLAUDE.md section 5.
const V1 = `
CREATE TABLE screenshots (
  id TEXT PRIMARY KEY,
  uri TEXT NOT NULL,
  taken_at INTEGER NOT NULL,
  width INTEGER NOT NULL DEFAULT 0,
  height INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  ocr_text TEXT,
  topic TEXT,
  processed_at INTEGER,
  error TEXT
);
CREATE INDEX idx_screenshots_taken_at ON screenshots(taken_at DESC);

CREATE TABLE entities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  screenshot_id TEXT NOT NULL REFERENCES screenshots(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('link', 'date', 'email', 'phone', 'task')),
  value TEXT NOT NULL,
  normalized TEXT,
  extra TEXT
);
CREATE INDEX idx_entities_screenshot ON entities(screenshot_id);

CREATE VIRTUAL TABLE screenshots_fts USING fts5(
  ocr_text,
  content='screenshots',
  content_rowid='rowid',
  tokenize='unicode61 remove_diacritics 2'
);
CREATE TRIGGER screenshots_ai AFTER INSERT ON screenshots BEGIN
  INSERT INTO screenshots_fts(rowid, ocr_text) VALUES (new.rowid, new.ocr_text);
END;
CREATE TRIGGER screenshots_ad AFTER DELETE ON screenshots BEGIN
  INSERT INTO screenshots_fts(screenshots_fts, rowid, ocr_text)
  VALUES ('delete', old.rowid, old.ocr_text);
END;
CREATE TRIGGER screenshots_au AFTER UPDATE OF ocr_text ON screenshots BEGIN
  INSERT INTO screenshots_fts(screenshots_fts, rowid, ocr_text)
  VALUES ('delete', old.rowid, old.ocr_text);
  INSERT INTO screenshots_fts(rowid, ocr_text) VALUES (new.rowid, new.ocr_text);
END;
`;

// v2: retry bookkeeping for the pipeline (CLAUDE.md section 6: retry with backoff).
const V2 = `
ALTER TABLE screenshots ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE screenshots ADD COLUMN next_retry_at INTEGER;
CREATE INDEX idx_screenshots_status ON screenshots(status, next_retry_at);
`;

export const MIGRATIONS: Migration[] = [
  { version: 1, sql: V1 },
  { version: 2, sql: V2 },
];

export const LATEST_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

export async function getSchemaVersion(db: SqlDb): Promise<number> {
  const rows = await db.all<{ user_version: number }>('PRAGMA user_version');
  return rows[0]?.user_version ?? 0;
}

/** Applies pending migrations in order, each in its own transaction. Refuses to downgrade. */
export async function migrate(
  db: SqlDb,
  migrations: Migration[] = MIGRATIONS,
  targetVersion?: number,
): Promise<number> {
  const latest = migrations[migrations.length - 1]?.version ?? 0;
  let current = await getSchemaVersion(db);
  if (current > latest) {
    throw new Error(`Database schema v${current} is newer than the app (v${latest})`);
  }
  for (const migration of migrations) {
    if (migration.version <= current) continue;
    if (targetVersion !== undefined && migration.version > targetVersion) break;
    await db.transaction(async (tx) => {
      await tx.exec(migration.sql);
      await tx.exec(`PRAGMA user_version = ${migration.version}`);
    });
    current = migration.version;
  }
  return current;
}
