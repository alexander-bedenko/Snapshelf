import type { ScreenshotRecord, ScreenshotRef, ScreenshotStatus } from './types';

export type ProcessedResult = {
  ocrText: string;
  topic: string | null;
  processedAt: number;
};

export type ListOptions = {
  limit?: number;
  offset?: number;
  status?: ScreenshotStatus;
};

export interface Repository {
  /** Inserts unknown screenshots as `pending`; never touches existing rows. Returns inserted count. */
  upsertDiscovered(refs: ScreenshotRef[]): Promise<number>;
  getById(id: string): Promise<ScreenshotRecord | null>;
  list(options?: ListOptions): Promise<ScreenshotRecord[]>;
  countByStatus(): Promise<Record<ScreenshotStatus, number>>;
  /** Atomically moves due `pending`/`failed` rows to `processing` and counts the attempt. */
  claimBatch(limit: number, now: number, maxAttempts: number): Promise<ScreenshotRecord[]>;
  /** Writes the result and marks the row `done` in one transaction. */
  markProcessed(id: string, result: ProcessedResult): Promise<void>;
  /** `nextRetryAt = null` means no more automatic retries. */
  markFailed(id: string, error: string, nextRetryAt: number | null): Promise<void>;
  /** After a crash/kill: `processing` rows go back to `pending` (or `failed` if out of attempts). */
  recoverInterrupted(maxAttempts: number): Promise<number>;
}
