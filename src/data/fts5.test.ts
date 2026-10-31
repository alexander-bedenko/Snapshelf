/**
 * @jest-environment node
 */
import { DatabaseSync } from 'node:sqlite';

// Runs against Node's bundled SQLite, not the expo-sqlite build used on-device.
// It checks that the FTS5 schema from CLAUDE.md section 5 is valid and queryable.
function createDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE screenshots (
      id TEXT PRIMARY KEY,
      uri TEXT,
      taken_at INTEGER,
      width INTEGER,
      height INTEGER,
      status TEXT,
      ocr_text TEXT,
      topic TEXT,
      processed_at INTEGER,
      error TEXT
    );
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
    CREATE TRIGGER screenshots_au AFTER UPDATE ON screenshots BEGIN
      INSERT INTO screenshots_fts(screenshots_fts, rowid, ocr_text)
      VALUES ('delete', old.rowid, old.ocr_text);
      INSERT INTO screenshots_fts(rowid, ocr_text) VALUES (new.rowid, new.ocr_text);
    END;
  `);
  return db;
}

function insert(db: DatabaseSync, id: string, text: string): void {
  db.prepare('INSERT INTO screenshots (id, status, ocr_text) VALUES (?, ?, ?)').run(
    id,
    'done',
    text,
  );
}

function search(db: DatabaseSync, query: string): string[] {
  const rows = db
    .prepare(
      `SELECT s.id AS id FROM screenshots_fts
       JOIN screenshots s ON s.rowid = screenshots_fts.rowid
       WHERE screenshots_fts MATCH ? ORDER BY s.id`,
    )
    .all(query) as { id: string }[];
  return rows.map((r) => r.id);
}

describe('SQLite FTS5', () => {
  it('is available in the SQLite build', () => {
    const db = new DatabaseSync(':memory:');
    const opts = db.prepare('PRAGMA compile_options').all() as { compile_options: string }[];
    expect(opts.map((o) => o.compile_options)).toContain('ENABLE_FTS5');
  });

  it('finds rows by word, prefix and Cyrillic text case-insensitively', () => {
    const db = createDb();
    insert(db, 'a', 'Meeting tomorrow at 10:00 https://example.com');
    insert(db, 'b', 'Купить молоко завтра');
    insert(db, 'c', 'Spotkanie jutro, trzeba zadzwonić');

    expect(search(db, 'meeting')).toEqual(['a']);
    expect(search(db, 'mee*')).toEqual(['a']);
    expect(search(db, 'МОЛОКО')).toEqual(['b']);
    expect(search(db, 'завтр*')).toEqual(['b']);
    expect(search(db, 'jutro')).toEqual(['c']);
    expect(search(db, 'nothing')).toEqual([]);
  });

  it('keeps the index in sync on update and delete via triggers', () => {
    const db = createDb();
    insert(db, 'a', 'alpha beta');

    db.prepare('UPDATE screenshots SET ocr_text = ? WHERE id = ?').run('gamma delta', 'a');
    expect(search(db, 'alpha')).toEqual([]);
    expect(search(db, 'gamma')).toEqual(['a']);

    db.prepare('DELETE FROM screenshots WHERE id = ?').run('a');
    expect(search(db, 'gamma')).toEqual([]);
  });
});
