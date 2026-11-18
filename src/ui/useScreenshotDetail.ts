import { useCallback, useEffect, useState } from 'react';

import { entityTarget } from '@/core/details/entityTarget';
import type { Repository, StoredEntity } from '@/core/repository';
import type { ScreenshotRecord } from '@/core/types';

import type { Strings } from './strings';

export type DetailDeps = {
  getRepository(): Promise<Repository>;
  openUrl(url: string): Promise<void>;
};

async function fetchDetail(deps: DetailDeps, id: string) {
  const repo = await deps.getRepository();
  const [record, entities] = await Promise.all([repo.getById(id), repo.getEntities(id)]);
  return { record, entities };
}

/** Loads one screenshot with its entities and performs the tap actions. */
export function useScreenshotDetail(id: string, deps: DetailDeps, strings: Strings) {
  const [loading, setLoading] = useState(true);
  const [record, setRecord] = useState<ScreenshotRecord | null>(null);
  const [entities, setEntities] = useState<StoredEntity[]>([]);
  const [error, setError] = useState<string | null>(null);

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
  }, [deps, id, strings]);

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
          setEntities((await fetchDetail(deps, id)).entities);
        }
      } catch {
        setError(strings.openFailed(entity.value));
      }
    },
    [deps, id, strings],
  );

  return { loading, record, entities, error, press };
}
