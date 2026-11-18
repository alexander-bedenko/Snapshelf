import { useCallback, useEffect, useState } from 'react';

import { entityTarget } from '@/core/details/entityTarget';
import type { Repository, StoredEntity } from '@/core/repository';
import type { ScreenshotRecord } from '@/core/types';

import type { Strings } from './strings';

export type DetailDeps = {
  getRepository(): Promise<Repository>;
  openUrl(url: string): Promise<void>;
  /** Queues the screenshot for OCR + extraction again. */
  reprocess(id: string): Promise<unknown>;
  /** Removes it from the app index (not from the gallery). */
  remove(id: string): Promise<boolean>;
  /** Called whenever the library changes (e.g. the pipeline finished this screenshot). */
  subscribe(listener: () => void): () => void;
};

async function fetchDetail(deps: DetailDeps, id: string) {
  const repo = await deps.getRepository();
  const [record, entities] = await Promise.all([repo.getById(id), repo.getEntities(id)]);
  return { record, entities };
}

/** Loads one screenshot with its entities, keeps it fresh and performs the actions. */
export function useScreenshotDetail(id: string, deps: DetailDeps, strings: Strings) {
  const [loading, setLoading] = useState(true);
  const [record, setRecord] = useState<ScreenshotRecord | null>(null);
  const [entities, setEntities] = useState<StoredEntity[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Bumped to reload: after an action, or when the library reports a change.
  const [version, setVersion] = useState(0);

  useEffect(() => deps.subscribe(() => setVersion((v) => v + 1)), [deps]);

  useEffect(() => {
    let cancelled = false;
    fetchDetail(deps, id).then(
      (detail) => {
        if (cancelled) return;
        setRecord(detail.record);
        setEntities(detail.entities);
        setLoading(false);
      },
      (e: unknown) => {
        if (cancelled) return;
        setError(strings.error(e instanceof Error ? e.message : String(e)));
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [deps, id, strings, version]);

  const press = useCallback(
    async (entity: StoredEntity) => {
      setError(null);
      const target = entityTarget(entity);
      try {
        if (target.kind === 'url') {
          await deps.openUrl(target.url);
        } else if (entity.type === 'task') {
          const repo = await deps.getRepository();
          await repo.setTaskDone(entity.id, !entity.extra.done);
          setVersion((v) => v + 1);
        }
      } catch {
        setError(strings.openFailed(entity.value));
      }
    },
    [deps, strings],
  );

  const reprocess = useCallback(async () => {
    setError(null);
    await deps.reprocess(id);
    setVersion((v) => v + 1);
  }, [deps, id]);

  /** Resolves to true when the screenshot is gone from the index. */
  const remove = useCallback(() => deps.remove(id), [deps, id]);

  return { loading, record, entities, error, press, reprocess, remove };
}
