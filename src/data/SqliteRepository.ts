import type { ExtractedEntity } from '@/core/extract';
import type {
  ListOptions,
  ProcessedResult,
  Repository,
  RequeueTarget,
  SearchOptions,
  StoredEntity,
} from '@/core/repository';
import { buildFtsQuery, foldForSearch } from '@/core/search/query';
import type { ScreenshotRecord, ScreenshotRef, ScreenshotStatus } from '@/core/types';

import type { SqlDb } from './sql';

type Row = {
  id: string;
  uri: string;
  taken_at: number;
  width: number;
  height: number;
  status: ScreenshotStatus;
  ocr_text: string | null;
  topic: string | null;
  processed_at: number | null;
  error: string | null;
  attempts: number;
  next_retry_at: number | null;
};

const COLUMNS =
  'id, uri, taken_at, width, height, status, ocr_text, topic, processed_at, error, attempts, next_retry_at';
const S_COLUMNS = COLUMNS.split(', ')
  .map((c) => `s.${c}`)
  .join(', ');

type EntityRow = {
  id: number;
  screenshot_id: string;
  type: ExtractedEntity['type'];
  value: string;
  normalized: string | null;
  extra: string | null;
};

function toEntity(row: EntityRow): StoredEntity {
  const base = {
    id: row.id,
    screenshotId: row.screenshot_id,
    value: row.value,
    normalized: row.normalized ?? row.value,
  };
  const extra = row.extra ? JSON.parse(row.extra) : undefined;
  if (row.type === 'date' || row.type === 'task') return { ...base, type: row.type, extra };
  return { ...base, type: row.type };
}

function toRecord(row: Row): ScreenshotRecord {
  return {
    id: row.id,
    uri: row.uri,
    takenAt: row.taken_at,
    width: row.width,
    height: row.height,
    status: row.status,
    ocrText: row.ocr_text,
    topic: row.topic,
    processedAt: row.processed_at,
    error: row.error,
    attempts: row.attempts,
    nextRetryAt: row.next_retry_at,
  };
}

/** Splits ids so a statement stays far below SQLite's bound-parameter limit. */
function chunks<T>(items: T[], size = 500): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

export class SqliteRepository implements Repository {
  constructor(private readonly db: SqlDb) {}

  async upsertDiscovered(refs: ScreenshotRef[]): Promise<number> {
    if (refs.length === 0) return 0;
    return this.db.transaction(async (tx) => {
      let inserted = 0;
      for (const ref of refs) {
        const { changes } = await tx.run(
          `INSERT OR IGNORE INTO screenshots (id, uri, taken_at, width, height, status)
           SELECT ?, ?, ?, ?, ?, 'pending'
           WHERE NOT EXISTS (SELECT 1 FROM removed_screenshots WHERE id = ?)`,
          [ref.id, ref.uri, ref.takenAt, ref.width, ref.height, ref.id],
        );
        inserted += changes;
      }
      return inserted;
    });
  }

  async getById(id: string): Promise<ScreenshotRecord | null> {
    const rows = await this.db.all<Row>(`SELECT ${COLUMNS} FROM screenshots WHERE id = ?`, [id]);
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async list({ limit = 200, offset = 0, status }: ListOptions = {}): Promise<ScreenshotRecord[]> {
    const where = status ? 'WHERE status = ?' : '';
    const params = status ? [status, limit, offset] : [limit, offset];
    const rows = await this.db.all<Row>(
      `SELECT ${COLUMNS} FROM screenshots ${where} ORDER BY taken_at DESC, id LIMIT ? OFFSET ?`,
      params,
    );
    return rows.map(toRecord);
  }

  async search(query: string, { limit = 100 }: SearchOptions = {}): Promise<ScreenshotRecord[]> {
    const match = buildFtsQuery(query);
    if (match === null) return [];
    const rows = await this.db.all<Row>(
      `SELECT ${S_COLUMNS}
       FROM screenshots_fts
       JOIN screenshots s ON s.rowid = screenshots_fts.rowid
       WHERE screenshots_fts MATCH ?
       ORDER BY bm25(screenshots_fts), s.taken_at DESC, s.id
       LIMIT ?`,
      [match, limit],
    );
    return rows.map(toRecord);
  }

  async countByStatus(): Promise<Record<ScreenshotStatus, number>> {
    const counts: Record<ScreenshotStatus, number> = {
      pending: 0,
      processing: 0,
      done: 0,
      failed: 0,
    };
    const rows = await this.db.all<{ status: ScreenshotStatus; n: number }>(
      'SELECT status, COUNT(*) AS n FROM screenshots GROUP BY status',
    );
    for (const row of rows) counts[row.status] = row.n;
    return counts;
  }

  async claimBatch(limit: number, now: number, maxAttempts: number): Promise<ScreenshotRecord[]> {
    return this.db.transaction(async (tx) => {
      const due = await tx.all<{ id: string }>(
        `SELECT id FROM screenshots
         WHERE attempts < ?
           AND (status = 'pending' OR (status = 'failed' AND next_retry_at <= ?))
         ORDER BY (status = 'pending') DESC, taken_at DESC, id
         LIMIT ?`,
        [maxAttempts, now, limit],
      );
      if (due.length === 0) return [];
      const ids = due.map((row) => row.id);
      const marks = ids.map(() => '?').join(', ');
      await tx.run(
        `UPDATE screenshots SET status = 'processing', attempts = attempts + 1
         WHERE id IN (${marks})`,
        ids,
      );
      const rows = await tx.all<Row>(
        `SELECT ${COLUMNS} FROM screenshots WHERE id IN (${marks}) ORDER BY taken_at DESC, id`,
        ids,
      );
      return rows.map(toRecord);
    });
  }

  async markProcessed(id: string, result: ProcessedResult): Promise<void> {
    await this.db.transaction(async (tx) => {
      // Entities are rebuilt from scratch so reprocessing stays idempotent.
      await tx.run('DELETE FROM entities WHERE screenshot_id = ?', [id]);
      const { changes } = await tx.run(
        `UPDATE screenshots
         SET status = 'done', ocr_text = ?, search_text = ?, topic = ?, processed_at = ?,
             error = NULL, next_retry_at = NULL
         WHERE id = ?`,
        [result.ocrText, foldForSearch(result.ocrText), result.topic, result.processedAt, id],
      );
      // Removed or pruned while OCR was running: nothing to write.
      if (changes === 0) return;
      for (const entity of result.entities ?? []) {
        await tx.run(
          `INSERT INTO entities (screenshot_id, type, value, normalized, extra)
           VALUES (?, ?, ?, ?, ?)`,
          [
            id,
            entity.type,
            entity.value,
            entity.normalized,
            entity.extra ? JSON.stringify(entity.extra) : null,
          ],
        );
      }
    });
  }

  async getEntities(screenshotId: string): Promise<StoredEntity[]> {
    const rows = await this.db.all<EntityRow>(
      `SELECT id, screenshot_id, type, value, normalized, extra
       FROM entities WHERE screenshot_id = ? ORDER BY id`,
      [screenshotId],
    );
    return rows.map(toEntity);
  }

  async setTaskDone(entityId: number, done: boolean): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx.all<{ extra: string | null }>(
        `SELECT extra FROM entities WHERE id = ? AND type = 'task'`,
        [entityId],
      );
      if (!row) return false;
      const extra = { ...(row.extra ? JSON.parse(row.extra) : {}), done };
      await tx.run('UPDATE entities SET extra = ? WHERE id = ?', [JSON.stringify(extra), entityId]);
      return true;
    });
  }

  async markFailed(id: string, error: string, nextRetryAt: number | null): Promise<void> {
    await this.db.run(
      `UPDATE screenshots SET status = 'failed', error = ?, next_retry_at = ? WHERE id = ?`,
      [error, nextRetryAt, id],
    );
  }

  async requeue(target: RequeueTarget): Promise<number> {
    const base = `UPDATE screenshots
      SET status = 'pending', attempts = 0, next_retry_at = NULL, error = NULL`;
    if (target === 'all') {
      return (await this.db.run(`${base} WHERE status IN ('done', 'failed')`)).changes;
    }
    if (target === 'failed') {
      return (await this.db.run(`${base} WHERE status = 'failed'`)).changes;
    }
    let total = 0;
    for (const ids of chunks(target.ids)) {
      const marks = ids.map(() => '?').join(', ');
      total += (
        await this.db.run(`${base} WHERE status IN ('done', 'failed') AND id IN (${marks})`, ids)
      ).changes;
    }
    return total;
  }

  async removeFromIndex(id: string, now: number): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const { changes } = await tx.run('DELETE FROM screenshots WHERE id = ?', [id]);
      if (changes === 0) return false;
      await tx.run('INSERT OR REPLACE INTO removed_screenshots (id, removed_at) VALUES (?, ?)', [
        id,
        now,
      ]);
      return true;
    });
  }

  async restoreRemoved(): Promise<number> {
    return (await this.db.run('DELETE FROM removed_screenshots')).changes;
  }

  async countRemoved(): Promise<number> {
    const [row] = await this.db.all<{ n: number }>('SELECT COUNT(*) AS n FROM removed_screenshots');
    return row?.n ?? 0;
  }

  async pruneMissing(presentIds: string[]): Promise<number> {
    const present = new Set(presentIds);
    return this.db.transaction(async (tx) => {
      const indexed = await tx.all<{ id: string }>('SELECT id FROM screenshots');
      const removed = await tx.all<{ id: string }>('SELECT id FROM removed_screenshots');
      const goneIndexed = indexed.map((r) => r.id).filter((id) => !present.has(id));
      const goneRemoved = removed.map((r) => r.id).filter((id) => !present.has(id));
      for (const ids of chunks(goneIndexed)) {
        const marks = ids.map(() => '?').join(', ');
        await tx.run(`DELETE FROM screenshots WHERE id IN (${marks})`, ids);
      }
      for (const ids of chunks(goneRemoved)) {
        const marks = ids.map(() => '?').join(', ');
        await tx.run(`DELETE FROM removed_screenshots WHERE id IN (${marks})`, ids);
      }
      return goneIndexed.length;
    });
  }

  async recoverInterrupted(maxAttempts: number): Promise<number> {
    return this.db.transaction(async (tx) => {
      await tx.run(
        `UPDATE screenshots
         SET status = 'failed', error = 'Interrupted too many times', next_retry_at = NULL
         WHERE status = 'processing' AND attempts >= ?`,
        [maxAttempts],
      );
      const { changes } = await tx.run(
        `UPDATE screenshots SET status = 'pending' WHERE status = 'processing'`,
      );
      return changes;
    });
  }
}
