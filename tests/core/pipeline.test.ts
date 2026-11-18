/**
 * @jest-environment node
 */
import { ScreenshotPipeline, type PipelineOptions } from '@/core/pipeline/ScreenshotPipeline';
import { PermissionDeniedError } from '@/core/types';
import { FakeScreenshotSource } from '@/platform/media/FakeScreenshotSource';
import { ControlledOcr } from '../helpers/ControlledOcr';
import { ref, refs, waitFor } from '../helpers/fixtures';
import { openTestRepo } from '../helpers/nodeSqlite';

async function setup(
  options: PipelineOptions = {},
  source = new FakeScreenshotSource({ screenshots: refs(0) }),
) {
  const { repo, db } = await openTestRepo();
  const ocr = new ControlledOcr();
  let now = 1_000_000;
  const pipeline = new ScreenshotPipeline(
    { source, ocr, repo },
    { now: () => now, yieldToUi: async () => undefined, ...options },
  );
  return {
    repo,
    db,
    ocr,
    source,
    pipeline,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe('ScreenshotPipeline.sync', () => {
  it('queues every screenshot the source reports', async () => {
    const { pipeline, repo } = await setup({}, new FakeScreenshotSource({ screenshots: refs(3) }));

    expect(await pipeline.sync()).toEqual({ status: 'ok', found: 3, inserted: 3 });
    expect(await pipeline.sync()).toEqual({ status: 'ok', found: 3, inserted: 0 });
    expect((await repo.countByStatus()).pending).toBe(3);
  });

  it.each(['undetermined', 'denied', 'blocked'] as const)(
    'does nothing and does not crash when permission is %s',
    async (permission) => {
      const source = new FakeScreenshotSource({ permission, screenshots: refs(3) });
      const { pipeline, repo, ocr } = await setup({}, source);

      expect(await pipeline.sync()).toEqual({ status: 'no-permission', permission });
      expect(await pipeline.processPending()).toEqual({ done: 0, failed: 0 });

      expect(source.listCount).toBe(0);
      expect(source.requestCount).toBe(0); // the pipeline never prompts by itself
      expect(ocr.calls).toEqual([]);
      expect(await repo.countByStatus()).toEqual({ pending: 0, processing: 0, done: 0, failed: 0 });
    },
  );

  it('reports no-permission when access is revoked between the check and the query', async () => {
    const source = new FakeScreenshotSource({ screenshots: refs(2) });
    jest.spyOn(source, 'listScreenshots').mockRejectedValue(new PermissionDeniedError());
    const { pipeline, repo } = await setup({}, source);

    expect(await pipeline.sync()).toEqual({ status: 'no-permission', permission: 'denied' });
    expect((await repo.countByStatus()).pending).toBe(0);
  });

  it('reports an empty library without touching OCR', async () => {
    const source = new FakeScreenshotSource({ screenshots: [] });
    const { pipeline, ocr } = await setup({}, source);

    expect(await pipeline.sync()).toEqual({ status: 'empty' });
    expect(await pipeline.processPending()).toEqual({ done: 0, failed: 0 });
    expect(ocr.calls).toEqual([]);
  });

  it('lets unexpected source errors surface', async () => {
    const source = new FakeScreenshotSource({ screenshots: refs(1) });
    jest.spyOn(source, 'listScreenshots').mockRejectedValue(new Error('MediaStore exploded'));
    const { pipeline } = await setup({}, source);

    await expect(pipeline.sync()).rejects.toThrow('MediaStore exploded');
  });
});

describe('ScreenshotPipeline.processPending', () => {
  it('recognizes, normalizes and stores text for every screenshot', async () => {
    const source = new FakeScreenshotSource({ screenshots: refs(3) });
    const { pipeline, repo, ocr } = await setup({}, source);
    ocr.setText(ref(1).uri, '  Купить   молоко \n\n пере-\nнос ');
    await pipeline.sync();

    expect(await pipeline.processPending()).toEqual({ done: 3, failed: 0 });

    expect(await repo.getById('s1')).toMatchObject({
      status: 'done',
      ocrText: 'Купить молоко\nперенос',
      processedAt: 1_000_000,
      error: null,
    });
    expect((await repo.countByStatus()).done).toBe(3);
  });

  it('never runs more than `concurrency` recognitions at once and claims bounded batches', async () => {
    const source = new FakeScreenshotSource({ screenshots: refs(9) });
    const { pipeline, repo, ocr } = await setup({ concurrency: 2, batchSize: 4 }, source);
    const claim = jest.spyOn(repo, 'claimBatch');
    await pipeline.sync();

    await pipeline.processPending();

    expect(ocr.maxInFlight).toBe(2);
    const sizes = (await Promise.all(claim.mock.results.map((r) => r.value))).map((b) => b.length);
    expect(sizes).toEqual([4, 4, 1, 0]);
    expect(claim.mock.calls.every(([limit]) => limit === 4)).toBe(true);
  });

  it('defaults to concurrency 2', async () => {
    const source = new FakeScreenshotSource({ screenshots: refs(6) });
    const { pipeline, ocr } = await setup({}, source);
    await pipeline.sync();

    await pipeline.processPending();

    expect(ocr.maxInFlight).toBe(2);
  });

  it('gives the event loop back between batches so timers (UI work) keep running', async () => {
    const source = new FakeScreenshotSource({ screenshots: refs(40) });
    const { repo, ocr } = await setup({}, source);
    // Real default yield, not the no-op from setup.
    const pipeline = new ScreenshotPipeline({ source, ocr, repo }, { batchSize: 4 });
    await pipeline.sync();

    let ticks = 0;
    const ticker = setInterval(() => ticks++, 0);
    await pipeline.processPending();
    clearInterval(ticker);

    // 40 items in batches of 4 = 10 batches; without yielding, timers would starve (ticks = 0).
    expect(ticks).toBeGreaterThanOrEqual(5);
  });

  it('calls yieldToUi once per non-empty batch', async () => {
    const yieldToUi = jest.fn(async () => undefined);
    const source = new FakeScreenshotSource({ screenshots: refs(5) });
    const { pipeline } = await setup({ batchSize: 2, yieldToUi }, source);
    await pipeline.sync();

    await pipeline.processPending();

    expect(yieldToUi).toHaveBeenCalledTimes(3);
  });

  it('is idempotent: finished screenshots are not recognized again', async () => {
    const source = new FakeScreenshotSource({ screenshots: refs(3) });
    const { pipeline, ocr } = await setup({}, source);
    await pipeline.sync();
    await pipeline.processPending();
    const callsAfterFirstRun = ocr.calls.length;

    await pipeline.sync();
    const second = await pipeline.processPending();

    expect(second).toEqual({ done: 0, failed: 0 });
    expect(ocr.calls).toHaveLength(callsAfterFirstRun);
  });

  it('keeps going when one image fails and records the error', async () => {
    const source = new FakeScreenshotSource({ screenshots: refs(3) });
    const { pipeline, repo, ocr } = await setup({}, source);
    ocr.failWith(ref(2).uri, 'Cannot read image');
    await pipeline.sync();

    expect(await pipeline.processPending()).toEqual({ done: 2, failed: 1 });

    expect(await repo.getById('s2')).toMatchObject({
      status: 'failed',
      error: 'Cannot read image',
      attempts: 1,
    });
    expect((await repo.getById('s3'))?.status).toBe('done');
  });

  it('retries failed screenshots with exponential backoff and then succeeds', async () => {
    const source = new FakeScreenshotSource({ screenshots: [ref(1)] });
    const { pipeline, repo, ocr, advance } = await setup(
      { backoffBaseMs: 1000, backoffMaxMs: 10_000 },
      source,
    );
    ocr.failWith(ref(1).uri, 'flaky');
    await pipeline.sync();

    await pipeline.processPending();
    expect((await repo.getById('s1'))?.nextRetryAt).toBe(1_000_000 + 1000);

    // Not due yet.
    advance(999);
    expect(await pipeline.processPending()).toEqual({ done: 0, failed: 0 });

    advance(1);
    await pipeline.processPending();
    expect(await repo.getById('s1')).toMatchObject({
      attempts: 2,
      nextRetryAt: 1_000_000 + 1000 + 2000,
    });

    ocr.clearFailure(ref(1).uri);
    advance(2000);
    expect(await pipeline.processPending()).toEqual({ done: 1, failed: 0 });
    expect(await repo.getById('s1')).toMatchObject({ status: 'done', attempts: 3, error: null });
  });

  it('caps the backoff delay', async () => {
    const source = new FakeScreenshotSource({ screenshots: [ref(1)] });
    const { pipeline, repo, ocr, advance } = await setup(
      { backoffBaseMs: 1000, backoffMaxMs: 1500, maxAttempts: 5 },
      source,
    );
    ocr.failWith(ref(1).uri, 'x');
    await pipeline.sync();
    await pipeline.processPending();
    advance(1000);
    const before = 1_000_000 + 1000;
    await pipeline.processPending();

    expect((await repo.getById('s1'))?.nextRetryAt).toBe(before + 1500);
  });

  it('stops retrying after maxAttempts and keeps the screenshot failed', async () => {
    const source = new FakeScreenshotSource({ screenshots: [ref(1)] });
    const { pipeline, repo, ocr, advance } = await setup(
      { maxAttempts: 2, backoffBaseMs: 10 },
      source,
    );
    ocr.failWith(ref(1).uri, 'always');
    await pipeline.sync();

    await pipeline.processPending();
    advance(1000);
    await pipeline.processPending();
    advance(10_000_000);
    expect(await pipeline.processPending()).toEqual({ done: 0, failed: 0 });

    expect(ocr.calls).toHaveLength(2);
    expect(await repo.getById('s1')).toMatchObject({
      status: 'failed',
      attempts: 2,
      nextRetryAt: null,
    });
  });

  it('folds concurrent calls into one run and still picks up late arrivals', async () => {
    const source = new FakeScreenshotSource({ screenshots: refs(4) });
    const { pipeline, repo, ocr } = await setup({ concurrency: 2, batchSize: 2 }, source);
    ocr.manual = true;
    await pipeline.sync();

    const first = pipeline.processPending();
    const second = pipeline.processPending();
    expect(second).toBe(first);
    await waitFor(() => ocr.heldUris.length === 2);

    // Arrives while the first batch is being recognized.
    await repo.upsertDiscovered([ref(5)]);
    const third = pipeline.processPending();
    expect(third).toBe(first);

    while ((await repo.countByStatus()).done < 5) {
      ocr.releaseAll();
      await new Promise((r) => setTimeout(r, 1));
    }
    await first;

    expect(ocr.maxInFlight).toBe(2);
    expect((await repo.countByStatus()).done).toBe(5);
  });

  it('stop() lets the in-flight batch finish but claims nothing more', async () => {
    const source = new FakeScreenshotSource({ screenshots: refs(6) });
    const { pipeline, repo, ocr } = await setup({ batchSize: 2 }, source);
    ocr.manual = true;
    await pipeline.sync();

    const run = pipeline.processPending();
    await waitFor(() => ocr.heldUris.length === 2);
    pipeline.stop();
    ocr.releaseAll();
    await run;

    expect(await repo.countByStatus()).toEqual({ pending: 4, processing: 0, done: 2, failed: 0 });
  });

  it('notifies subscribers about progress', async () => {
    const source = new FakeScreenshotSource({ screenshots: refs(2) });
    const { pipeline } = await setup({}, source);
    const listener = jest.fn();
    const unsubscribe = pipeline.subscribe(listener);

    await pipeline.sync();
    await pipeline.processPending();
    const calls = listener.mock.calls.length;
    unsubscribe();
    await pipeline.sync();

    expect(calls).toBeGreaterThanOrEqual(3); // sync + two items
    expect(listener).toHaveBeenCalledTimes(calls);
  });
});

describe('ScreenshotPipeline.watch', () => {
  it('queues and processes screenshots taken while the app is running', async () => {
    const source = new FakeScreenshotSource({ screenshots: [] });
    const { pipeline, repo } = await setup({}, source);
    const unwatch = pipeline.watch();

    source.emitNew([ref(7)]);
    await waitFor(async () => (await repo.getById('s7'))?.status === 'done');

    unwatch();
    expect(source.listenerCount).toBe(0);
  });

  it('reports errors through onError instead of throwing', async () => {
    const source = new FakeScreenshotSource();
    const onError = jest.fn();
    const { pipeline, repo } = await setup({ onError }, source);
    jest.spyOn(repo, 'upsertDiscovered').mockRejectedValue(new Error('db gone'));
    pipeline.watch();

    source.emitNew([ref(1)]);

    await waitFor(() => onError.mock.calls.length === 1);
    expect(onError.mock.calls[0][0]).toEqual(new Error('db gone'));
  });
});

describe('ScreenshotPipeline: extraction (M4)', () => {
  it('stores entities with the text, resolving dates against the screenshot day', async () => {
    const takenAt = new Date('2026-11-18T10:00').getTime();
    const shot = ref(1, { takenAt });
    const { pipeline, repo, ocr } = await setup(
      {},
      new FakeScreenshotSource({ screenshots: [shot] }),
    );
    ocr.setText(shot.uri, 'Купить молоко завтра\nhttps://example.com  +48 501 234 567');

    await pipeline.sync();
    await pipeline.processPending();

    const entities = await repo.getEntities('s1');
    expect(entities.map(({ type, normalized }) => [type, normalized])).toEqual([
      ['link', 'https://example.com'],
      ['phone', '+48501234567'],
      ['date', '2026-11-19'],
      ['task', 'Купить молоко завтра'],
    ]);
    expect(entities.every((e) => e.screenshotId === 's1' && e.id > 0)).toBe(true);
  });

  it('keeps entities idempotent when a screenshot is processed again', async () => {
    const shot = ref(1);
    const { pipeline, repo, ocr } = await setup(
      {},
      new FakeScreenshotSource({ screenshots: [shot] }),
    );
    ocr.setText(shot.uri, 'a@b.com');
    await pipeline.sync();
    await pipeline.processPending();

    await repo.markProcessed('s1', {
      ocrText: 'a@b.com',
      topic: null,
      processedAt: 2,
      entities: [{ type: 'email', value: 'a@b.com', normalized: 'a@b.com' }],
    });

    expect(await repo.getEntities('s1')).toHaveLength(1);
  });
});
