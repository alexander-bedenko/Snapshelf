/**
 * Search text folding and FTS5 query building. Pure TS, shared by the indexer and the query side
 * so both always fold the same way.
 *
 * FTS5 `unicode61 remove_diacritics 2` already folds case and Latin diacritics (ó→o, ż→z), but
 * - `ł`/`Ł` have no Unicode decomposition, so FTS5 keeps them;
 * - it does not fold Cyrillic `ё`, while Russian text and queries often use `е` instead.
 * Both are folded here. `й` is a separate letter and stays.
 */
export function foldForSearch(text: string): string {
  return text
    .normalize('NFC')
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .replace(/ё/g, 'е')
    .replace(/Ё/g, 'Е');
}

/** More terms than this add nothing for a screenshot search and only slow the query down. */
export const MAX_QUERY_TERMS = 8;

const TERM = /[\p{L}\p{N}]+/gu;

/**
 * Turns free user input into an FTS5 MATCH expression: every word becomes a quoted prefix term
 * and all terms must match (implicit AND). FTS5 syntax characters in the input are dropped, so
 * the result is always a valid expression. Returns `null` when there is nothing to search for.
 */
export function buildFtsQuery(input: string): string | null {
  const terms = foldForSearch(input).match(TERM);
  if (!terms) return null;
  const unique = [...new Set(terms.map((t) => t.toLowerCase()))].slice(0, MAX_QUERY_TERMS);
  return unique.map((t) => `"${t}"*`).join(' ');
}
