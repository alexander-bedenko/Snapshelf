import type { ExtractedEntity } from './extract';
import type { ScreenshotRecord, ScreenshotRef, ScreenshotStatus } from './types';

export type ProcessedResult = {
  ocrText: string;
  topic: string | null;
  processedAt: number;
  /** Replaces the screenshot's entities; none when omitted. */
  entities?: ExtractedEntity[];
};

/** An entity as stored: `id` is the row id, used to update a task's done state. */
export type StoredEntity = ExtractedEntity & { id: number; screenshotId: string };

export type ListOptions = {
  limit?: number;
  offset?: number;
  status?: ScreenshotStatus;
};

export type SearchOptions = {
  limit?: number;
};

export interface Repository {
  /** Inserts unknown screenshots as `pending`; never touches existing rows. Returns inserted count. */
  upsertDiscovered(refs: ScreenshotRef[]): Promise<number>;
  getById(id: string): Promise<ScreenshotRecord | null>;
  list(options?: ListOptions): Promise<ScreenshotRecord[]>;
  countByStatus(): Promise<Record<ScreenshotStatus, number>>;
  /** Atomically moves due `pending`/`failed` rows to `processing` and counts the attempt. */
  claimBatch(limit: number, now: number, maxAttempts: number): Promise<ScreenshotRecord[]>;
  /** Writes the result (text, entities) and marks the row `done` in one transaction. */
  markProcessed(id: string, result: ProcessedResult): Promise<void>;
  /** `nextRetryAt = null` means no more automatic retries. */
  markFailed(id: string, error: string, nextRetryAt: number | null): Promise<void>;
  /** Entities of one screenshot in the order they were extracted. */
  getEntities(screenshotId: string): Promise<StoredEntity[]>;
  /** Marks a task entity done/undone. Returns false when no such task exists. */
  setTaskDone(entityId: number, done: boolean): Promise<boolean>;
  /**
   * Full-text search over recognized text: every word of `query` must match as a prefix,
   * case- and diacritics-insensitive (ru/en/pl). Best match first, then newest.
   * Returns `[]` for a query without words.
   */
  search(query: string, options?: SearchOptions): Promise<ScreenshotRecord[]>;
  /** After a crash/kill: `processing` rows go back to `pending` (or `failed` if out of attempts). */
  recoverInterrupted(maxAttempts: number): Promise<number>;
}
