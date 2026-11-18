import type { ExtractedEntity } from './types';

// A leading "+" or a digit, then digits with spaces, tabs, dashes or brackets (never a line break:
// two numbers on adjacent lines stay two numbers).
const CANDIDATE = /(?<![\p{L}\p{N}+])\+?\(?\d[\d \t()-]{6,}\d(?![\p{L}\p{N}])/gu;

/**
 * Phone numbers: 9–15 digits (E.164 allows at most 15). Dots are not separators here, so dates
 * like 12.03.2026 never match; times (14:00) and sizes (128 MB) are too short.
 */
export function extractPhones(text: string): ExtractedEntity[] {
  const result: ExtractedEntity[] = [];
  for (const m of text.matchAll(CANDIDATE)) {
    const value = m[0].trim();
    const digits = value.replace(/\D/g, '');
    if (digits.length < 9 || digits.length > 15) continue;
    const plus = value.startsWith('+') ? '+' : '';
    result.push({ type: 'phone', value, normalized: plus + digits });
  }
  return result;
}
