import { extractDates } from './dates';
import { extractEmails, extractLinks, maskLinksAndEmails } from './links';
import { extractPhones } from './phones';
import { extractTasks } from './tasks';
import type { ExtractedEntity } from './types';

export type { EntityType, ExtractedEntity, TaskExtra, DateExtra } from './types';

/**
 * All entities in a screenshot's normalized OCR text. Phones and dates are looked for outside
 * links and emails. Duplicates (same type and normalized value) are kept once, first one wins.
 */
export function extractEntities(text: string, takenAt: number): ExtractedEntity[] {
  const outside = maskLinksAndEmails(text);
  const all = [
    ...extractLinks(text),
    ...extractEmails(text),
    ...extractPhones(outside),
    ...extractDates(outside, takenAt),
    ...extractTasks(text),
  ];
  const seen = new Set<string>();
  return all.filter((e) => {
    const key = `${e.type}\u0000${e.normalized}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
