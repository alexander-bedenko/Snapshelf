import type { ExtractedEntity } from './types';

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

const SCHEME_URL = /\b(?:https?:\/\/|www\.)[^\s<>"'«»]+/gi;

// TLDs that are also common words in en/pl (it, at, be, no, us, me, so...) are left out on
// purpose: OCR often drops the space after a period ("dog.It"), which would turn into a "link".
const TLDS =
  'com|net|org|io|dev|app|ai|info|biz|edu|gov|ru|pl|ua|by|kz|de|eu|uk|ca|fr|nl|cz|ch|se|fi|dk';
const BARE_DOMAIN = new RegExp(
  `(?<![\\p{L}\\p{N}@._/-])(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+(?:${TLDS})(?![\\p{L}\\p{N}-])(?:/[^\\s<>"'«»]*)?`,
  'giu',
);

const TRAILING_CHARS = '.,;:!?»"\']})';

/** Drops trailing punctuation, but keeps a closing bracket that closes one inside the URL. */
export function trimUrl(raw: string): string {
  let url = raw;
  while (url.length > 0 && TRAILING_CHARS.includes(url[url.length - 1])) {
    const last = url[url.length - 1];
    if (last === ')') {
      const opens = (url.match(/\(/g) ?? []).length;
      const closes = (url.match(/\)/g) ?? []).length;
      // "wiki/Foo_(bar)" keeps its ")"; "(see https://x.com)" loses it.
      if (closes <= opens) break;
    }
    url = url.slice(0, -1);
  }
  return url;
}

export function normalizeUrl(url: string): string {
  const withScheme = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  const match = withScheme.match(/^(https?:\/\/)([^/?#]+)(.*)$/i);
  if (!match) return withScheme;
  return `${match[1].toLowerCase()}${match[2].toLowerCase()}${match[3]}`;
}

/** Replaces matches with spaces so later passes do not see them, while keeping offsets. */
function mask(text: string, re: RegExp): string {
  return text.replace(re, (m) => ' '.repeat(m.length));
}

export function extractEmails(text: string): ExtractedEntity[] {
  return [...text.matchAll(EMAIL)].map((m) => {
    const value = m[0].replace(/\.+$/, '');
    return { type: 'email' as const, value, normalized: value.toLowerCase() };
  });
}

export function extractLinks(text: string): ExtractedEntity[] {
  const found: { index: number; value: string }[] = [];
  const noEmails = mask(text, EMAIL);
  for (const m of noEmails.matchAll(SCHEME_URL)) {
    found.push({ index: m.index, value: trimUrl(m[0]) });
  }
  const rest = mask(noEmails, SCHEME_URL);
  for (const m of rest.matchAll(BARE_DOMAIN)) {
    found.push({ index: m.index, value: trimUrl(m[0]) });
  }
  return found
    .filter((f) => /\.[\p{L}]{2,}/u.test(f.value))
    .sort((a, b) => a.index - b.index)
    .map((f) => ({ type: 'link' as const, value: f.value, normalized: normalizeUrl(f.value) }));
}

/** Text with emails and links blanked out, for extractors that must not look inside them. */
export function maskLinksAndEmails(text: string): string {
  return mask(mask(mask(text, EMAIL), SCHEME_URL), BARE_DOMAIN);
}
