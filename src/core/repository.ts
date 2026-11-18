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

/** Which screenshots to process again. Rows being processed right now are never touched. */
export type RequeueTarget = { ids: string[] } | 'all' | 'failed';

export interface Repository {
  /**
   * Inserts unknown screenshots as `pending`; never touches existing rows and skips screenshots the
   * user removed from the index. Returns inserted count.
   */
  upsertDiscovered(refs: ScreenshotRef[]): Promise<number>;
  getById(id: string): Promise<ScreenshotRecord | null>;
  list(options?: ListOptions): Promise<ScreenshotRecord[]>;
  countByStatus(): Promise<Record<ScreenshotStatus, number>>;
  /** Atomically moves due `pending`/`failed` rows to `processing` and counts the attempt. */
  claimBatch(limit: number, now: number, maxAttempts: number): Promise<ScreenshotRecord[]>;
  /**
   * Writes the result (text, entities) and marks the row `done` in one transaction. Does nothing
   * if the screenshot was removed or pruned while it was being processed.
   */
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
  /** Puts finished/failed screenshots back in the queue with fresh attempts. Returns how many. */
  requeue(target: RequeueTarget): Promise<number>;
  /**
   * Removes a screenshot (and its text and entities) from the app index and remembers its id so
   * gallery scans skip it. The photo itself is not touched. Returns false if it was not indexed.
   */
  removeFromIndex(id: string, now: number): Promise<boolean>;
  /** Forgets all removals; the next gallery scan adds those screenshots again. Returns how many. */
  restoreRemoved(): Promise<number>;
  countRemoved(): Promise<number>;
  /**
   * Drops indexed and removed screenshots whose ids are not in `presentIds` (deleted from the
   * gallery). Returns how many indexed screenshots were dropped.
   */
  pruneMissing(presentIds: string[]): Promise<number>;
  /** After a crash/kill: `processing` rows go back to `pending` (or `failed` if out of attempts). */
  recoverInterrupted(maxAttempts: number): Promise<number>;
}
