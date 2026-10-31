/**
 * Cleans raw OCR output: unifies line breaks, joins words hyphenated across lines,
 * collapses horizontal whitespace and drops empty lines. Line structure is kept
 * because task extraction (M4) relies on it.
 */
export function normalizeOcrText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/(\p{L})[-\u00AD]\n(\p{Ll})/gu, '$1$2')
    .replace(/\u00AD/g, '')
    .replace(/[^\S\n]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n');
}
