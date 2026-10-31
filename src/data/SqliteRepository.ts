import type { ListOptions, ProcessedResult, Repository } from '@/core/repository';
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

export class SqliteRepository implements Repository {
  constructor(private readonly db: SqlDb) {}

  async upsertDiscovered(refs: ScreenshotRef[]): Promise<number> {
    if (refs.length === 0) return 0;
    return this.db.transaction(async (tx) => {
      let inserted = 0;
      for (const ref of refs) {
        const { changes } = await tx.run(
          `INSERT OR IGNORE INTO screenshots (id, uri, taken_at, width, height, status)
           VALUES (?, ?, ?, ?, ?, 'pending')`,
          [ref.id, ref.uri, ref.takenAt, ref.width, ref.height],
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
      await tx.run(
        `UPDATE screenshots
         SET status = 'done', ocr_text = ?, topic = ?, processed_at = ?, error = NULL,
             next_retry_at = NULL
         WHERE id = ?`,
        [result.ocrText, result.topic, result.processedAt, id],
      );
    });
  }

  async markFailed(id: string, error: string, nextRetryAt: number | null): Promise<void> {
    await this.db.run(
      `UPDATE screenshots SET status = 'failed', error = ?, next_retry_at = ? WHERE id = ?`,
      [error, nextRetryAt, id],
    );
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
