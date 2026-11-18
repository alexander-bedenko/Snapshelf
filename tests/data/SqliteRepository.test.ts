/**
 * @jest-environment node
 */
import { SqliteRepository } from '@/data/SqliteRepository';
import type { SqlDb, SqlExecutor } from '@/data/sql';
import { openTestRepo } from '../helpers/nodeSqlite';
import { ref, refs } from '../helpers/fixtures';

const MAX = 3;

describe('SqliteRepository', () => {
  it('queues unknown screenshots as pending and ignores known ones', async () => {
    const { repo } = await openTestRepo();

    expect(await repo.upsertDiscovered(refs(3))).toBe(3);
    expect(await repo.upsertDiscovered(refs(5))).toBe(2);
    expect(await repo.upsertDiscovered([])).toBe(0);

    expect(await repo.countByStatus()).toEqual({ pending: 5, processing: 0, done: 0, failed: 0 });
    expect(await repo.getById('s1')).toMatchObject({
      id: 's1',
      uri: 'content://media/external/images/media/1',
      status: 'pending',
      attempts: 0,
      ocrText: null,
    });
    expect(await repo.getById('missing')).toBeNull();
  });

  it('does not reset finished work when the same screenshot is discovered again', async () => {
    const { repo } = await openTestRepo();
    await repo.upsertDiscovered([ref(1)]);
    await repo.claimBatch(10, 0, MAX);
    await repo.markProcessed('s1', { ocrText: 'text', topic: null, processedAt: 42 });

    await repo.upsertDiscovered([ref(1)]);

    expect(await repo.getById('s1')).toMatchObject({
      status: 'done',
      ocrText: 'text',
      processedAt: 42,
    });
  });

  it('lists newest first with paging and status filter', async () => {
    const { repo } = await openTestRepo();
    await repo.upsertDiscovered(refs(5));
    await repo.claimBatch(2, 0, MAX); // newest two become processing

    expect((await repo.list()).map((r) => r.id)).toEqual(['s5', 's4', 's3', 's2', 's1']);
    expect((await repo.list({ limit: 2, offset: 1 })).map((r) => r.id)).toEqual(['s4', 's3']);
    expect((await repo.list({ status: 'processing' })).map((r) => r.id)).toEqual(['s5', 's4']);
  });

  it('claims the newest pending rows first, marks them processing and counts the attempt', async () => {
    const { repo } = await openTestRepo();
    await repo.upsertDiscovered(refs(4));

    const batch = await repo.claimBatch(2, 0, MAX);

    expect(batch.map((r) => r.id)).toEqual(['s4', 's3']);
    expect(batch.every((r) => r.status === 'processing' && r.attempts === 1)).toBe(true);
    expect(await repo.countByStatus()).toEqual({ pending: 2, processing: 2, done: 0, failed: 0 });
    // Claimed rows are not handed out twice.
    expect((await repo.claimBatch(10, 0, MAX)).map((r) => r.id)).toEqual(['s2', 's1']);
    expect(await repo.claimBatch(10, 0, MAX)).toEqual([]);
  });

  it('retries failed rows only when due and while attempts remain', async () => {
    const { repo } = await openTestRepo();
    await repo.upsertDiscovered([ref(1), ref(2)]);
    await repo.claimBatch(10, 0, MAX);
    await repo.markFailed('s1', 'boom', 1000);
    await repo.markFailed('s2', 'fatal', null);

    expect(await repo.claimBatch(10, 999, MAX)).toEqual([]);
    const due = await repo.claimBatch(10, 1000, MAX);
    expect(due.map((r) => [r.id, r.attempts])).toEqual([['s1', 2]]);

    await repo.markFailed('s1', 'boom again', 2000);
    await repo.claimBatch(10, 2000, MAX); // attempt 3 of 3
    await repo.markFailed('s1', 'last', 3000);
    expect(await repo.claimBatch(10, 9_999_999, MAX)).toEqual([]);
  });

  it('writes the result and clears the error in markProcessed', async () => {
    const { repo } = await openTestRepo();
    await repo.upsertDiscovered([ref(1)]);
    await repo.claimBatch(10, 0, MAX);
    await repo.markFailed('s1', 'boom', 10);
    await repo.claimBatch(10, 10, MAX);

    await repo.markProcessed('s1', { ocrText: 'Hello', topic: 'misc', processedAt: 77 });

    expect(await repo.getById('s1')).toMatchObject({
      status: 'done',
      ocrText: 'Hello',
      topic: 'misc',
      processedAt: 77,
      error: null,
      nextRetryAt: null,
    });
  });

  it('keeps the full-text index in sync with processed text', async () => {
    const { repo, db } = await openTestRepo();
    await repo.upsertDiscovered([ref(1), ref(2)]);
    await repo.claimBatch(10, 0, MAX);
    await repo.markProcessed('s1', { ocrText: 'Купить молоко', topic: null, processedAt: 1 });
    await repo.markProcessed('s2', { ocrText: 'Zażółć gęślą jaźń', topic: null, processedAt: 1 });

    const match = (q: string) =>
      db.all<{ id: string }>(
        `SELECT s.id FROM screenshots_fts f JOIN screenshots s ON s.rowid = f.rowid
         WHERE screenshots_fts MATCH ?`,
        [q],
      );
    expect(await match('молоко')).toEqual([{ id: 's1' }]);
    // The index holds folded text (ł → l, see foldForSearch), so the raw MATCH needs no ł.
    expect(await match('zazolc')).toEqual([{ id: 's2' }]);

    await repo.markProcessed('s1', { ocrText: 'другой текст', topic: null, processedAt: 2 });
    expect(await match('молоко')).toEqual([]);
    expect(await match('другой')).toEqual([{ id: 's1' }]);
  });

  it('replaces entities when a screenshot is processed again', async () => {
    const { repo, db } = await openTestRepo();
    await repo.upsertDiscovered([ref(1)]);
    await db.run(`INSERT INTO entities (screenshot_id, type, value) VALUES ('s1', 'link', 'old')`);

    await repo.markProcessed('s1', { ocrText: 'x', topic: null, processedAt: 1 });

    expect(await db.all('SELECT id FROM entities')).toEqual([]);
  });

  it('recovers interrupted work: processing goes back to pending, exhausted rows fail', async () => {
    const { repo } = await openTestRepo();
    await repo.upsertDiscovered([ref(1), ref(2)]);
    await repo.claimBatch(10, 0, MAX); // attempt 1 for both
    await repo.markFailed('s2', 'x', 0);
    await repo.claimBatch(10, 0, MAX); // s2 attempt 2
    await repo.markFailed('s2', 'x', 0);
    await repo.claimBatch(10, 0, MAX); // s2 attempt 3 = max, still processing when "killed"

    const recovered = await repo.recoverInterrupted(MAX);

    expect(recovered).toBe(1);
    expect(await repo.getById('s1')).toMatchObject({ status: 'pending', attempts: 1 });
    expect(await repo.getById('s2')).toMatchObject({
      status: 'failed',
      error: 'Interrupted too many times',
      nextRetryAt: null,
    });
  });

  it('rolls markProcessed back completely when a statement fails midway', async () => {
    const { db } = await openTestRepo();
    const seeded = new SqliteRepository(db);
    await seeded.upsertDiscovered([ref(1)]);
    await seeded.claimBatch(10, 0, MAX);
    await db.run(
      `INSERT INTO entities (screenshot_id, type, value) VALUES ('s1', 'link', 'keep me')`,
    );

    const failing: SqlDb = {
      ...db,
      transaction: (fn) =>
        db.transaction((tx) =>
          fn({
            ...tx,
            exec: tx.exec,
            all: tx.all,
            run: (sql, params) =>
              sql.startsWith('UPDATE screenshots')
                ? Promise.reject(new Error('disk full'))
                : (tx as SqlExecutor).run(sql, params),
          }),
        ),
    };

    await expect(
      new SqliteRepository(failing).markProcessed('s1', {
        ocrText: 'new',
        topic: null,
        processedAt: 1,
      }),
    ).rejects.toThrow('disk full');

    expect(await seeded.getById('s1')).toMatchObject({ status: 'processing', ocrText: null });
    expect(await db.all('SELECT value FROM entities')).toEqual([{ value: 'keep me' }]);
  });

  it('serializes concurrent transactions on one connection', async () => {
    const { repo } = await openTestRepo();
    await repo.upsertDiscovered(refs(20));

    const batches = await Promise.all([repo.claimBatch(10, 0, MAX), repo.claimBatch(10, 0, MAX)]);

    const ids = batches.flat().map((r) => r.id);
    expect(ids).toHaveLength(20);
    expect(new Set(ids).size).toBe(20);
  });
});

describe('SqliteRepository: entities', () => {
  async function processed() {
    const { repo, db } = await openTestRepo();
    await repo.upsertDiscovered([ref(1), ref(2)]);
    await repo.markProcessed('s1', {
      ocrText: 'x',
      topic: null,
      processedAt: 1,
      entities: [
        { type: 'link', value: 'x.com', normalized: 'https://x.com' },
        { type: 'date', value: 'завтра', normalized: '2026-11-19', extra: { hasTime: false } },
        {
          type: 'task',
          value: '[ ] milk',
          normalized: 'milk',
          extra: { rule: 'checkbox', done: false },
        },
      ],
    });
    return { repo, db };
  }

  it('stores and reads entities in extraction order with their extra data', async () => {
    const { repo } = await processed();

    const entities = await repo.getEntities('s1');

    expect(entities.map(({ id: _id, ...rest }) => rest)).toEqual([
      { screenshotId: 's1', type: 'link', value: 'x.com', normalized: 'https://x.com' },
      {
        screenshotId: 's1',
        type: 'date',
        value: 'завтра',
        normalized: '2026-11-19',
        extra: { hasTime: false },
      },
      {
        screenshotId: 's1',
        type: 'task',
        value: '[ ] milk',
        normalized: 'milk',
        extra: { rule: 'checkbox', done: false },
      },
    ]);
    expect(await repo.getEntities('s2')).toEqual([]);
  });

  it('replaces entities on reprocessing and removes them with the screenshot', async () => {
    const { repo, db } = await processed();

    await repo.markProcessed('s1', { ocrText: 'y', topic: null, processedAt: 2 });
    expect(await repo.getEntities('s1')).toEqual([]);

    await repo.markProcessed('s1', {
      ocrText: 'y',
      topic: null,
      processedAt: 3,
      entities: [{ type: 'email', value: 'a@b.c', normalized: 'a@b.c' }],
    });
    await db.run(`DELETE FROM screenshots WHERE id = 's1'`);
    expect(await db.all('SELECT id FROM entities')).toEqual([]);
  });

  it('toggles a task done, keeping its other data, and refuses non-tasks', async () => {
    const { repo } = await processed();
    const [link, , task] = await repo.getEntities('s1');

    expect(await repo.setTaskDone(task.id, true)).toBe(true);
    expect((await repo.getEntities('s1'))[2].extra).toEqual({ rule: 'checkbox', done: true });
    expect(await repo.setTaskDone(task.id, false)).toBe(true);
    expect((await repo.getEntities('s1'))[2].extra).toEqual({ rule: 'checkbox', done: false });

    expect(await repo.setTaskDone(link.id, true)).toBe(false);
    expect(await repo.setTaskDone(9999, true)).toBe(false);
  });
});
