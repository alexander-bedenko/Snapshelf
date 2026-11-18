import type { Repository } from '@/core/repository';
import { PermissionDeniedError } from '@/core/types';
import type { PermissionState, ScreenshotRecord, Unsub } from '@/core/types';
import type { OcrEngine } from '@/platform/ocr/OcrEngine';
import type { ScreenshotSource } from '@/platform/media/ScreenshotSource';

import { extractEntities, type ExtractedEntity } from '../extract';
import { normalizeOcrText } from './normalize';

export type PipelineOptions = {
  /** Screenshots recognized at the same time. */
  concurrency?: number;
  /** Rows claimed from the DB per round. */
  batchSize?: number;
  maxAttempts?: number;
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  langHints?: string[];
  now?: () => number;
  /** Gives the JS thread back to the UI between batches. */
  yieldToUi?: () => Promise<void>;
  onError?: (error: unknown) => void;
};

export type SyncResult =
  | { status: 'no-permission'; permission: PermissionState }
  | { status: 'empty' }
  | { status: 'ok'; found: number; inserted: number; pruned: number };

export type ProcessResult = { done: number; failed: number };

const DEFAULTS = {
  concurrency: 2,
  batchSize: 10,
  maxAttempts: 5,
  backoffBaseMs: 30_000,
  backoffMaxMs: 3_600_000,
  langHints: ['ru', 'en', 'pl'],
};

const defaultYield = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export class ScreenshotPipeline {
  private readonly o: Required<Omit<PipelineOptions, 'onError'>> & Pick<PipelineOptions, 'onError'>;
  private running: Promise<ProcessResult> | null = null;
  private rerun = false;
  private stopped = false;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly deps: { source: ScreenshotSource; ocr: OcrEngine; repo: Repository },
    options: PipelineOptions = {},
  ) {
    this.o = {
      ...DEFAULTS,
      now: Date.now,
      yieldToUi: defaultYield,
      ...stripUndefined(options),
    };
  }

  /** Notifies after every state change (sync, item done or failed). */
  subscribe(listener: () => void): Unsub {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Call once on app start: work that was in flight when the app died goes back to the queue. */
  async recover(): Promise<number> {
    const count = await this.deps.repo.recoverInterrupted(this.o.maxAttempts);
    if (count > 0) this.emit();
    return count;
  }

  /** Reads the media library and queues unknown screenshots. Never throws on missing permission. */
  async sync(): Promise<SyncResult> {
    const permission = await this.deps.source.getPermission();
    if (permission !== 'granted') return { status: 'no-permission', permission };

    let refs;
    try {
      refs = await this.deps.source.listScreenshots();
    } catch (error) {
      // Permission revoked between the check and the query.
      if (error instanceof PermissionDeniedError) {
        return { status: 'no-permission', permission: 'denied' };
      }
      throw error;
    }
    // An empty list is not used to prune: a glitch in the media query must not wipe the index.
    if (refs.length === 0) return { status: 'empty' };

    const inserted = await this.deps.repo.upsertDiscovered(refs);
    // Screenshots deleted from the gallery leave the index too (this is a full listing).
    const pruned = await this.deps.repo.pruneMissing(refs.map((r) => r.id));
    this.emit();
    return { status: 'ok', found: refs.length, inserted, pruned };
  }

  /**
   * Processes everything that is due, `batchSize` rows at a time with at most `concurrency`
   * in flight. Calls made while a run is active are folded into it (single flight).
   */
  processPending(): Promise<ProcessResult> {
    this.stopped = false;
    if (this.running) {
      this.rerun = true;
      return this.running;
    }
    const run = this.runLoop().finally(() => {
      this.running = null;
    });
    this.running = run;
    return run;
  }

  /** Queues screenshots reported by the source while the app is running. */
  watch(): Unsub {
    return this.deps.source.onNew((refs) => {
      this.deps.repo
        .upsertDiscovered(refs)
        .then(() => {
          this.emit();
          return this.processPending();
        })
        .catch((error) => this.o.onError?.(error));
    });
  }

  /** Stops claiming new batches; the in-flight batch finishes. */
  stop(): void {
    this.stopped = true;
  }

  private async runLoop(): Promise<ProcessResult> {
    const total: ProcessResult = { done: 0, failed: 0 };
    do {
      this.rerun = false;
      while (!this.stopped) {
        const batch = await this.deps.repo.claimBatch(
          this.o.batchSize,
          this.o.now(),
          this.o.maxAttempts,
        );
        if (batch.length === 0) break;
        const result = await this.runPool(batch);
        total.done += result.done;
        total.failed += result.failed;
        await this.o.yieldToUi();
      }
    } while (this.rerun && !this.stopped);
    return total;
  }

  private async runPool(batch: ScreenshotRecord[]): Promise<ProcessResult> {
    const result: ProcessResult = { done: 0, failed: 0 };
    const queue = [...batch];
    const worker = async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        if (await this.processOne(item)) result.done++;
        else result.failed++;
      }
    };
    const workers = Array.from({ length: Math.min(this.o.concurrency, batch.length) }, worker);
    await Promise.all(workers);
    return result;
  }

  private async processOne(item: ScreenshotRecord): Promise<boolean> {
    let ocrText: string;
    let entities: ExtractedEntity[];
    try {
      const recognized = await this.deps.ocr.recognize(item.uri, this.o.langHints);
      ocrText = normalizeOcrText(recognized.text);
      // Dates like "tomorrow" resolve against the day the screenshot was taken.
      entities = extractEntities(ocrText, item.takenAt);
    } catch (error) {
      await this.deps.repo.markFailed(
        item.id,
        errorMessage(error),
        this.nextRetryAt(item.attempts),
      );
      this.emit();
      return false;
    }
    await this.deps.repo.markProcessed(item.id, {
      ocrText,
      topic: null,
      processedAt: this.o.now(),
      entities,
    });
    this.emit();
    return true;
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  private nextRetryAt(attempts: number): number | null {
    if (attempts >= this.o.maxAttempts) return null;
    const delay = Math.min(this.o.backoffMaxMs, this.o.backoffBaseMs * 2 ** (attempts - 1));
    return this.o.now() + delay;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}
