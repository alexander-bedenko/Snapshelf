import type { ExtractedEntity } from '../extract';

export type EntityTarget = { kind: 'url'; url: string } | { kind: 'toggle-task' };

/** Parses the extractor's local ISO date (`2026-03-12` or `2026-03-12T15:30`) as device local time. */
export function localIsoToEpoch(iso: string): number {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/);
  if (!m) throw new Error(`Not a local ISO date: ${iso}`);
  return new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4] ?? 0),
    Number(m[5] ?? 0),
  ).getTime();
}

/**
 * What tapping an entity does. Links, emails and phones open the matching app; a date opens the
 * Android calendar at that day/time (`content://com.android.calendar/time/<ms>`, the documented
 * CalendarContract view intent); a task is checked off inside Snapshelf.
 */
export function entityTarget(entity: ExtractedEntity): EntityTarget {
  switch (entity.type) {
    case 'link':
      return { kind: 'url', url: entity.normalized };
    case 'email':
      return { kind: 'url', url: `mailto:${entity.normalized}` };
    case 'phone':
      return { kind: 'url', url: `tel:${entity.normalized}` };
    case 'date':
      return {
        kind: 'url',
        url: `content://com.android.calendar/time/${localIsoToEpoch(entity.normalized)}`,
      };
    case 'task':
      return { kind: 'toggle-task' };
  }
}

/** `2026-03-12T15:30` → `2026-03-12 15:30` for display. */
export function formatLocalIso(iso: string): string {
  return iso.replace('T', ' ');
}
