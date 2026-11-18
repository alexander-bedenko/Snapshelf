import { createStore, type StoreApi } from 'zustand/vanilla';

import type { Repository, RequeueTarget } from '@/core/repository';
import type { PermissionState, ScreenshotRecord, ScreenshotStatus } from '@/core/types';
import type { ScreenshotSource } from '@/platform/media/ScreenshotSource';

import type { ScreenshotPipeline } from '../pipeline/ScreenshotPipeline';
import { buildFtsQuery } from '../search/query';

export type LibraryState = {
  /** `unknown` until the first check finishes. */
  permission: PermissionState | 'unknown';
  initialized: boolean;
  syncing: boolean;
  processing: boolean;
  /** `true` when the last sync found no screenshots on the device. */
  deviceEmpty: boolean;
  counts: Record<ScreenshotStatus, number>;
  /** Screenshots the user removed from the index (the photos stay in the gallery). */
  removedCount: number;
  items: ScreenshotRecord[];
  error: string | null;
  /** Current search input, as typed. */
  query: string;
  /** Search hits for `query`; `null` when there is no active search. */
  results: ScreenshotRecord[] | null;
  searching: boolean;
  init(): Promise<void>;
  /** Updates the search input; the query runs after a short debounce. */
  setQuery(query: string): void;
  requestPermission(): Promise<void>;
  refresh(): Promise<void>;
  /** Processes screenshots again (e.g. after an OCR update, or to retry failures). Returns how many. */
  reprocess(target: RequeueTarget): Promise<number>;
  /** Removes a screenshot from the app index without touching the photo. */
  remove(id: string): Promise<boolean>;
  /** Brings removed screenshots back on the next gallery scan (runs one now). Returns how many. */
  restoreRemoved(): Promise<number>;
  /** Call when the app returns to the foreground (e.g. after the user visited system settings). */
  onForeground(): Promise<void>;
  dispose(): void;
};

export type LibraryStore = StoreApi<LibraryState>;

export type LibraryDeps = {
  source: ScreenshotSource;
  repo: Repository;
  pipeline: ScreenshotPipeline;
  listLimit?: number;
  /** Trailing throttle for DB reloads while the pipeline is busy. */
  reloadDelayMs?: number;
  now?: () => number;
  /** Debounce between keystrokes and the search query. */
  searchDelayMs?: number;
  searchLimit?: number;
};

const EMPTY_COUNTS: Record<ScreenshotStatus, number> = {
  pending: 0,
  processing: 0,
  done: 0,
  failed: 0,
};

export function createLibraryStore(deps: LibraryDeps): LibraryStore {
  const { source, repo, pipeline } = deps;
  const listLimit = deps.listLimit ?? 200;
  const reloadDelayMs = deps.reloadDelayMs ?? 250;
  const searchDelayMs = deps.searchDelayMs ?? 150;
  const searchLimit = deps.searchLimit ?? 100;
  const now = deps.now ?? Date.now;
  let unwatch: (() => void) | null = null;
  let reloadTimer: ReturnType<typeof setTimeout> | undefined;
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  // Only the newest search may write results, so a slow older query cannot overwrite them.
  let searchSeq = 0;
  let disposed = false;

  const store: LibraryStore = createStore<LibraryState>(() => ({
    permission: 'unknown',
    initialized: false,
    syncing: false,
    processing: false,
    deviceEmpty: false,
    counts: EMPTY_COUNTS,
    removedCount: 0,
    items: [],
    error: null,
    query: '',
    results: null,
    searching: false,
    init,
    setQuery,
    requestPermission,
    refresh,
    reprocess,
    remove,
    restoreRemoved,
    onForeground,
    dispose,
  }));
  const set = store.setState;

  const unsubscribePipeline = pipeline.subscribe(scheduleReload);

  function fail(error: unknown) {
    set({ error: error instanceof Error ? error.message : String(error) });
  }

  async function reload() {
    const [counts, items, removedCount] = await Promise.all([
      repo.countByStatus(),
      repo.list({ limit: listLimit }),
      repo.countRemoved(),
    ]);
    if (!disposed) set({ counts, items, removedCount });
    // Newly processed screenshots may match the active search.
    if (store.getState().results !== null) await runSearch();
  }

  async function runSearch() {
    const seq = ++searchSeq;
    const { query } = store.getState();
    if (buildFtsQuery(query) === null) {
      set({ results: null, searching: false });
      return;
    }
    set({ searching: true });
    try {
      const results = await repo.search(query, { limit: searchLimit });
      if (seq === searchSeq && !disposed) set({ results });
    } finally {
      if (seq === searchSeq && !disposed) set({ searching: false });
    }
  }

  function setQuery(query: string) {
    set({ query });
    clearTimeout(searchTimer);
    searchTimer = undefined;
    if (buildFtsQuery(query) === null) {
      searchSeq++; // drop any query still in flight
      set({ results: null, searching: false });
      return;
    }
    searchTimer = setTimeout(() => {
      searchTimer = undefined;
      runSearch().catch(fail);
    }, searchDelayMs);
  }

  function scheduleReload() {
    if (reloadTimer !== undefined || disposed) return;
    reloadTimer = setTimeout(() => {
      reloadTimer = undefined;
      reload().catch(fail);
    }, reloadDelayMs);
  }

  async function startProcessing() {
    set({ processing: true });
    try {
      await pipeline.processPending();
    } catch (error) {
      fail(error);
    } finally {
      set({ processing: false });
      await reload().catch(fail);
    }
  }

  async function syncAndProcess() {
    set({ syncing: true, error: null });
    try {
      const result = await pipeline.sync();
      if (result.status === 'no-permission') {
        set({ permission: result.permission });
        return;
      }
      set({ permission: 'granted', deviceEmpty: result.status === 'empty' });
      await reload();
      if (!unwatch) unwatch = pipeline.watch();
      void startProcessing();
    } catch (error) {
      fail(error);
    } finally {
      set({ syncing: false });
    }
  }

  async function init() {
    try {
      // Anything that was mid-flight when the app was killed goes back to the queue.
      await pipeline.recover();
      await reload();
      const permission = await source.getPermission();
      set({ permission });
      // No permission prompt here: the UI explains first (CLAUDE.md section 12).
      if (permission === 'granted') await syncAndProcess();
    } catch (error) {
      fail(error);
    } finally {
      set({ initialized: true });
    }
  }

  async function requestPermission() {
    const permission = await source.requestPermission();
    set({ permission });
    if (permission === 'granted') await syncAndProcess();
  }

  async function refresh() {
    if (store.getState().permission !== 'granted') return;
    await syncAndProcess();
  }

  async function reprocess(target: RequeueTarget) {
    try {
      const count = await repo.requeue(target);
      await reload();
      if (count > 0) void startProcessing();
      return count;
    } catch (error) {
      fail(error);
      return 0;
    }
  }

  async function remove(id: string) {
    try {
      const removed = await repo.removeFromIndex(id, now());
      await reload();
      return removed;
    } catch (error) {
      fail(error);
      return false;
    }
  }

  async function restoreRemoved() {
    try {
      const count = await repo.restoreRemoved();
      await reload();
      if (count > 0 && store.getState().permission === 'granted') await syncAndProcess();
      return count;
    } catch (error) {
      fail(error);
      return 0;
    }
  }

  async function onForeground() {
    const state = store.getState();
    if (!state.initialized || state.syncing) return;
    try {
      const permission = await source.getPermission();
      if (permission === 'granted') {
        await syncAndProcess();
      } else if (state.permission === 'granted') {
        // Revoked while the app was in the background.
        set({ permission });
      }
    } catch (error) {
      fail(error);
    }
  }

  function dispose() {
    disposed = true;
    clearTimeout(reloadTimer);
    clearTimeout(searchTimer);
    unwatch?.();
    unwatch = null;
    unsubscribePipeline();
    pipeline.stop();
  }

  return store;
}
