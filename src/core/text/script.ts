/** Letter counts per script; other characters (digits, punctuation, other scripts) are ignored. */
export type ScriptStats = { cyrillic: number; latin: number };

const CYRILLIC = /\p{Script=Cyrillic}/u;
const LATIN = /\p{Script=Latin}/u;
const LETTER = /\p{L}/u;

export function scriptStats(text: string): ScriptStats {
  const stats: ScriptStats = { cyrillic: 0, latin: 0 };
  for (const ch of text) {
    if (!LETTER.test(ch)) continue;
    if (CYRILLIC.test(ch)) stats.cyrillic++;
    else if (LATIN.test(ch)) stats.latin++;
  }
  return stats;
}

/** Share of Cyrillic among Cyrillic + Latin letters; 0 when the text has neither. */
export function cyrillicShare(text: string): number {
  const { cyrillic, latin } = scriptStats(text);
  const total = cyrillic + latin;
  return total === 0 ? 0 : cyrillic / total;
}
