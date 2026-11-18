export type EntityType = 'link' | 'date' | 'email' | 'phone' | 'task';

export type DateExtra = { hasTime: boolean };
export type TaskRule = 'checkbox' | 'keyword' | 'verb';
export type TaskExtra = { rule: TaskRule; done: boolean };

/** One thing found in a screenshot's text. `value` is the text as it appears in the screenshot. */
export type ExtractedEntity =
  | { type: 'link' | 'email' | 'phone'; value: string; normalized: string; extra?: undefined }
  | { type: 'date'; value: string; normalized: string; extra: DateExtra }
  | { type: 'task'; value: string; normalized: string; extra: TaskExtra };

/** Unicode-aware word boundaries: `\b` in JS regexes only knows ASCII letters. */
export const WB_START = '(?<![\\p{L}\\p{N}])';
export const WB_END = '(?![\\p{L}\\p{N}])';
