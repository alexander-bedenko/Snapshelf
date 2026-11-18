/**
 * @jest-environment node
 */
import { ScreenshotPipeline } from '@/core/pipeline/ScreenshotPipeline';
import { SqliteRepository } from '@/data/SqliteRepository';
import { FakeScreenshotSource } from '@/platform/media/FakeScreenshotSource';
import { ControlledOcr } from '../helpers/ControlledOcr';
import { ref, refs, waitFor } from '../helpers/fixtures';
import { openTestDb, tempDbPath } from '../helpers/nodeSqlite';

/**
 * "Kill" = close the SQLite connection and abandon the pipeline instance while OCR is in flight,
 * then open the same database file the way a fresh app start would.
 */
async function startApp(
  path: string,
  ocr: ControlledOcr,
  source: FakeScreenshotSource,
  maxAttempts = 5,
) {
  const db = await openTestDb(path);
  const repo = new SqliteRepository(db);
  const pipeline = new ScreenshotPipeline(
    { source, ocr, repo },
    { batchSize: 4, concurrency: 2, maxAttempts, yieldToUi: async () => undefined },
  );
  return { db, repo, pipeline };
}

describe('app killed in the middle of processing and restarted', () => {
  it('keeps finished work, re-queues interrupted work and finishes without duplicates', async () => {
    const path = tempDbPath();
    const source = new FakeScreenshotSource({ screenshots: refs(4) });

    // --- first run: s4 finishes, the others are stuck in OCR when the app dies
    const ocr1 = new ControlledOcr();
    ocr1.manual = true;
    const run1 = await startApp(path, ocr1, source);
    await run1.pipeline.sync();
    const processing = run1.pipeline.processPending();
    processing.catch(() => undefined);
    await waitFor(() => ocr1.heldUris.length === 2);
    ocr1.release(ref(4).uri);
    await waitFor(async () => (await run1.repo.getById('s4'))?.status === 'done');
    await waitFor(() => ocr1.heldUris.length === 2);
    expect(await run1.repo.countByStatus()).toEqual({
      pending: 0,
      processing: 3,
      done: 1,
      failed: 0,
    });

    await run1.db.close(); // the process dies here

    // A zombie OCR callback from the dead process cannot write anything.
    ocr1.releaseAll();
    await expect(processing).rejects.toThrow();

    // --- second run: same file, new process
    const ocr2 = new ControlledOcr();
    const run2 = await startApp(path, ocr2, source);
    expect(await run2.repo.countByStatus()).toEqual({
      pending: 0,
      processing: 3,
      done: 1,
      failed: 0,
    });

    expect(await run2.pipeline.recover()).toBe(3);
    expect(await run2.pipeline.sync()).toEqual({ status: 'ok', found: 4, inserted: 0, pruned: 0 });
    expect(await run2.repo.countByStatus()).toEqual({
      pending: 3,
      processing: 0,
      done: 1,
      failed: 0,
    });

    expect(await run2.pipeline.processPending()).toEqual({ done: 3, failed: 0 });

    expect(await run2.repo.countByStatus()).toEqual({
      pending: 0,
      processing: 0,
      done: 4,
      failed: 0,
    });
    // The finished screenshot was not recognized again, and nothing was recognized twice.
    expect(ocr2.calls.sort()).toEqual([ref(1).uri, ref(2).uri, ref(3).uri]);
    expect(await run2.repo.getById('s4')).toMatchObject({ status: 'done', attempts: 1 });
    expect(await run2.repo.getById('s1')).toMatchObject({
      status: 'done',
      attempts: 2,
      ocrText: `text of ${ref(1).uri}`,
    });
    expect(await run2.repo.list()).toHaveLength(4);
  });

  it('keeps stored screenshots and text across a restart without permission', async () => {
    const path = tempDbPath();
    const source = new FakeScreenshotSource({ screenshots: refs(2) });
    const run1 = await startApp(path, new ControlledOcr(), source);
    await run1.pipeline.sync();
    await run1.pipeline.processPending();
    await run1.db.close();

    const denied = new FakeScreenshotSource({ permission: 'denied', screenshots: refs(2) });
    const run2 = await startApp(path, new ControlledOcr(), denied);

    expect(await run2.pipeline.recover()).toBe(0);
    expect(await run2.pipeline.sync()).toEqual({ status: 'no-permission', permission: 'denied' });
    expect((await run2.repo.list()).map((r) => [r.id, r.status])).toEqual([
      ['s2', 'done'],
      ['s1', 'done'],
    ]);
  });

  it('does not loop on an image that keeps killing the app: attempts are counted at claim time', async () => {
    const path = tempDbPath();
    const source = new FakeScreenshotSource({ screenshots: [ref(1)] });

    const ocr1 = new ControlledOcr();
    ocr1.manual = true;
    const run1 = await startApp(path, ocr1, source, 1);
    await run1.pipeline.sync();
    const processing = run1.pipeline.processPending();
    processing.catch(() => undefined);
    await waitFor(() => ocr1.heldUris.length === 1);
    await run1.db.close(); // killed on the only allowed attempt
    ocr1.releaseAll();
    await expect(processing).rejects.toThrow();

    const ocr2 = new ControlledOcr();
    const run2 = await startApp(path, ocr2, source, 1);
    await run2.pipeline.recover();
    await run2.pipeline.processPending();

    expect(ocr2.calls).toEqual([]);
    expect(await run2.repo.getById('s1')).toMatchObject({
      status: 'failed',
      error: 'Interrupted too many times',
    });
  });

  it('a kill between OCR and the DB write loses nothing: the row stays processing, then is redone', async () => {
    const path = tempDbPath();
    const source = new FakeScreenshotSource({ screenshots: [ref(1)] });
    const run1 = await startApp(path, new ControlledOcr(), source);
    await run1.pipeline.sync();
    await run1.repo.claimBatch(1, 0, 5); // claimed, OCR "finished", process died before markProcessed
    await run1.db.close();

    const ocr2 = new ControlledOcr();
    const run2 = await startApp(path, ocr2, source);
    await run2.pipeline.recover();
    await run2.pipeline.processPending();

    expect(await run2.repo.getById('s1')).toMatchObject({ status: 'done', attempts: 2 });
    expect(ocr2.calls).toEqual([ref(1).uri]);
  });
});
