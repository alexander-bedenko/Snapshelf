/**
 * @jest-environment node
 */
import { createLibraryStore } from '@/core/library/libraryStore';
import { ScreenshotPipeline } from '@/core/pipeline/ScreenshotPipeline';
import { SqliteRepository } from '@/data/SqliteRepository';
import { FakeScreenshotSource } from '@/platform/media/FakeScreenshotSource';
import { ControlledOcr } from '../helpers/ControlledOcr';
import { deferred, refs, waitFor } from '../helpers/fixtures';
import { openTestDb, tempDbPath } from '../helpers/nodeSqlite';

async function setup(source: FakeScreenshotSource, path = ':memory:', searchDelayMs = 0) {
  const db = await openTestDb(path);
  const repo = new SqliteRepository(db);
  const ocr = new ControlledOcr();
  const pipeline = new ScreenshotPipeline(
    { source, ocr, repo },
    { yieldToUi: async () => undefined },
  );
  const store = createLibraryStore({ source, repo, pipeline, reloadDelayMs: 0, searchDelayMs });
  return { db, repo, ocr, pipeline, store, source };
}

describe('library store: permission flow', () => {
  it('picks up access granted in system settings when the app returns to the foreground', async () => {
    const source = new FakeScreenshotSource({ permission: 'blocked', screenshots: refs(2) });
    const { store } = await setup(source);
    await store.getState().init();
    expect(store.getState().permission).toBe('blocked');
    expect(source.listCount).toBe(0);

    source.permission = 'granted'; // the user flipped the switch in settings
    await store.getState().onForeground();

    expect(store.getState().permission).toBe('granted');
    await waitFor(() => store.getState().counts.done === 2);
  });

  it('keeps the blocked state when nothing changed in settings', async () => {
    const source = new FakeScreenshotSource({ permission: 'blocked', screenshots: refs(2) });
    const { store } = await setup(source);
    await store.getState().init();

    await store.getState().onForeground();

    expect(store.getState().permission).toBe('blocked');
    expect(source.listCount).toBe(0);
  });

  it('notices access revoked in the background and stops listing', async () => {
    const source = new FakeScreenshotSource({ screenshots: refs(1) });
    const { store } = await setup(source);
    await store.getState().init();
    await waitFor(() => store.getState().counts.done === 1);
    const lists = source.listCount;

    source.permission = 'undetermined';
    await store.getState().onForeground();

    expect(store.getState().permission).toBe('undetermined');
    expect(source.listCount).toBe(lists);
    expect(store.getState().items).toHaveLength(1); // stored data stays visible
  });

  it('does not ask for permission at launch, it only reports that it is needed', async () => {
    const { store, source, ocr } = await setup(
      new FakeScreenshotSource({ permission: 'undetermined', screenshots: refs(3) }),
    );

    await store.getState().init();

    expect(source.requestCount).toBe(0);
    expect(source.listCount).toBe(0);
    expect(ocr.calls).toEqual([]);
    expect(store.getState()).toMatchObject({
      initialized: true,
      permission: 'undetermined',
      items: [],
      error: null,
    });
  });

  it('syncs and processes after the user grants access', async () => {
    const { store, source } = await setup(
      new FakeScreenshotSource({ permission: 'undetermined', screenshots: refs(3) }),
    );
    await store.getState().init();

    await store.getState().requestPermission();

    expect(source.requestCount).toBe(1);
    expect(store.getState().permission).toBe('granted');
    await waitFor(() => store.getState().counts.done === 3 && !store.getState().processing);
    expect(store.getState().items.map((i) => i.status)).toEqual(['done', 'done', 'done']);
    expect(store.getState().deviceEmpty).toBe(false);
  });

  it('stays usable when the user denies: no screenshots are read, retry is possible', async () => {
    const source = new FakeScreenshotSource({ permission: 'undetermined', screenshots: refs(2) });
    source.requestResult = 'denied';
    const { store, ocr } = await setup(source);
    await store.getState().init();

    await store.getState().requestPermission();

    expect(store.getState()).toMatchObject({ permission: 'denied', items: [], error: null });
    expect(source.listCount).toBe(0);
    expect(ocr.calls).toEqual([]);

    // Second try, now allowed.
    source.requestResult = 'granted';
    await store.getState().requestPermission();
    expect(source.requestCount).toBe(2);
    await waitFor(() => store.getState().counts.done === 2);
  });

  it('reports a permanently blocked permission so the UI can offer system settings', async () => {
    const source = new FakeScreenshotSource({ permission: 'undetermined', screenshots: refs(2) });
    source.requestResult = 'blocked';
    const { store } = await setup(source);
    await store.getState().init();

    await store.getState().requestPermission();

    expect(store.getState().permission).toBe('blocked');
    expect(store.getState().error).toBeNull();
  });

  it('refresh does nothing without permission', async () => {
    const { store, source } = await setup(
      new FakeScreenshotSource({ permission: 'denied', screenshots: refs(2) }),
    );
    await store.getState().init();

    await store.getState().refresh();

    expect(source.listCount).toBe(0);
  });
});

describe('library store: no screenshots', () => {
  it('shows an empty library when the device has no screenshots', async () => {
    const { store, ocr } = await setup(new FakeScreenshotSource({ screenshots: [] }));

    await store.getState().init();

    expect(store.getState()).toMatchObject({
      initialized: true,
      permission: 'granted',
      deviceEmpty: true,
      items: [],
      syncing: false,
      error: null,
    });
    expect(ocr.calls).toEqual([]);
  });

  it('leaves the empty state when a screenshot appears and the user rescans', async () => {
    const source = new FakeScreenshotSource({ screenshots: [] });
    const { store } = await setup(source);
    await store.getState().init();

    source.screenshots = refs(1);
    await store.getState().refresh();

    expect(store.getState().deviceEmpty).toBe(false);
    await waitFor(() => store.getState().counts.done === 1);
  });
});

describe('library store: processing and restart', () => {
  it('picks up screenshots taken while the app is open', async () => {
    const source = new FakeScreenshotSource({ screenshots: [] });
    const { store } = await setup(source);
    await store.getState().init();

    source.emitNew(refs(2));

    await waitFor(() => store.getState().counts.done === 2);
    expect(store.getState().items).toHaveLength(2);
  });

  it('after a kill during processing, restart restores the list and finishes the work', async () => {
    const path = tempDbPath();
    const source = new FakeScreenshotSource({ screenshots: refs(4) });

    // first run: two items finish, then the process dies with the rest mid-flight
    const first = await setup(source, path);
    first.ocr.manual = true;
    await first.store.getState().init();
    await waitFor(() => first.ocr.heldUris.length === 2);
    first.ocr.releaseAll();
    await waitFor(async () => (await first.repo.countByStatus()).done >= 2);
    await waitFor(() => first.ocr.heldUris.length === 2);
    await first.db.close();
    first.ocr.releaseAll();

    // second run: the UI sees stored data first, before any permission or sync work
    const denied = new FakeScreenshotSource({ permission: 'undetermined', screenshots: refs(4) });
    const offline = await setup(denied, path);
    await offline.store.getState().init();
    expect(offline.store.getState().items).toHaveLength(4);
    expect(offline.store.getState().counts.done).toBe(2);
    expect(offline.store.getState().counts.pending).toBe(2); // interrupted rows were re-queued
    expect(offline.store.getState().counts.processing).toBe(0);

    // the user allows access: the remaining work completes
    await offline.store.getState().requestPermission();
    await waitFor(
      () => offline.store.getState().counts.done === 4 && !offline.store.getState().processing,
    );
    expect((await offline.repo.list()).length).toBe(4);
  });

  it('surfaces unexpected failures as an error without crashing', async () => {
    const source = new FakeScreenshotSource({ screenshots: refs(1) });
    jest.spyOn(source, 'listScreenshots').mockRejectedValue(new Error('MediaStore exploded'));
    const { store } = await setup(source);

    await store.getState().init();

    expect(store.getState()).toMatchObject({
      initialized: true,
      syncing: false,
      error: 'MediaStore exploded',
    });
  });

  it('dispose stops watching and processing', async () => {
    const source = new FakeScreenshotSource({ screenshots: [] });
    const { store } = await setup(source);
    await store.getState().init();
    expect(source.listenerCount).toBe(1);

    store.getState().dispose();

    expect(source.listenerCount).toBe(0);
  });
});

describe('library store: search', () => {
  const uri = (n: number) => `content://media/external/images/media/${n}`;

  async function ready(texts: string[]) {
    const source = new FakeScreenshotSource({ screenshots: refs(texts.length) });
    const ctx = await setup(source);
    texts.forEach((text, i) => ctx.ocr.setText(uri(i + 1), text));
    await ctx.store.getState().init();
    await waitFor(() => ctx.store.getState().counts.done === texts.length);
    return ctx;
  }

  it('finds processed screenshots and clears the search on empty input', async () => {
    const { store } = await ready(['Купить молоко', 'Zażółć gęślą jaźń', 'meeting notes']);

    store.getState().setQuery('zazolc');
    await waitFor(() => store.getState().results !== null && !store.getState().searching);
    expect(store.getState().results?.map((r) => r.id)).toEqual(['s2']);

    store.getState().setQuery('  ');
    expect(store.getState()).toMatchObject({ query: '  ', results: null, searching: false });
  });

  it('returns an empty list, not null, when nothing matches', async () => {
    const { store } = await ready(['alpha']);

    store.getState().setQuery('omega');
    await waitFor(() => store.getState().results !== null && !store.getState().searching);
    expect(store.getState().results).toEqual([]);
  });

  it('debounces keystrokes and only applies the newest query', async () => {
    const source = new FakeScreenshotSource({ screenshots: [] });
    const { store, repo } = await setup(source, ':memory:', 20);
    await store.getState().init();
    const spy = jest.spyOn(repo, 'search');

    store.getState().setQuery('m');
    store.getState().setQuery('mi');
    store.getState().setQuery('mil');
    await waitFor(() => store.getState().results !== null && !store.getState().searching);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('mil', { limit: 100 });
  });

  it('ignores a slow older result that arrives after a newer one', async () => {
    const source = new FakeScreenshotSource({ screenshots: [] });
    const { store, repo } = await setup(source);
    await store.getState().init();
    const slow = deferred<never[]>();
    const original = repo.search.bind(repo);
    jest
      .spyOn(repo, 'search')
      .mockImplementationOnce(() => slow.promise)
      .mockImplementation(original);

    store.getState().setQuery('first');
    await waitFor(() => store.getState().searching);
    store.getState().setQuery('');
    expect(store.getState().results).toBeNull();

    slow.resolve([]);
    await new Promise((r) => setTimeout(r, 10));
    expect(store.getState()).toMatchObject({ results: null, searching: false });
  });

  it('refreshes the active search when new screenshots are processed', async () => {
    const source = new FakeScreenshotSource({ screenshots: refs(1) });
    const { store, ocr } = await setup(source);
    ocr.setText(uri(1), 'invoice 1');
    ocr.setText(uri(2), 'invoice 2');
    await store.getState().init();
    await waitFor(() => store.getState().counts.done === 1);
    store.getState().setQuery('invoice');
    await waitFor(() => store.getState().results?.length === 1);

    source.emitNew(refs(2).slice(1));

    await waitFor(() => store.getState().results?.length === 2);
  });
});
