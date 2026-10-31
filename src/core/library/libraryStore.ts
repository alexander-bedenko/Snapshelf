import { createStore, type StoreApi } from 'zustand/vanilla';

import type { Repository } from '@/core/repository';
import type { PermissionState, ScreenshotRecord, ScreenshotStatus } from '@/core/types';
import type { ScreenshotSource } from '@/platform/media/ScreenshotSource';

import type { ScreenshotPipeline } from '../pipeline/ScreenshotPipeline';

export type LibraryState = {
  /** `unknown` until the first check finishes. */
  permission: PermissionState | 'unknown';
  initialized: boolean;
  syncing: boolean;
  processing: boolean;
  /** `true` when the last sync found no screenshots on the device. */
  deviceEmpty: boolean;
  counts: Record<ScreenshotStatus, number>;
  items: ScreenshotRecord[];
  error: string | null;
  init(): Promise<void>;
  requestPermission(): Promise<void>;
  refresh(): Promise<void>;
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
  let unwatch: (() => void) | null = null;
  let reloadTimer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;

  const store: LibraryStore = createStore<LibraryState>(() => ({
    permission: 'unknown',
    initialized: false,
    syncing: false,
    processing: false,
    deviceEmpty: false,
    counts: EMPTY_COUNTS,
    items: [],
    error: null,
    init,
    requestPermission,
    refresh,
    dispose,
  }));
  const set = store.setState;

  const unsubscribePipeline = pipeline.subscribe(scheduleReload);

  function fail(error: unknown) {
    set({ error: error instanceof Error ? error.message : String(error) });
  }

  async function reload() {
    const [counts, items] = await Promise.all([
      repo.countByStatus(),
      repo.list({ limit: listLimit }),
    ]);
    if (!disposed) set({ counts, items });
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

  function dispose() {
    disposed = true;
    clearTimeout(reloadTimer);
    unwatch?.();
    unwatch = null;
    unsubscribePipeline();
    pipeline.stop();
  }

  return store;
}
