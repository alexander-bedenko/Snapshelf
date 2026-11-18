/**
 * @jest-environment node
 */
import { extractEntities } from '@/core/extract';
import { extractDates } from '@/core/extract/dates';
import { normalizeUrl, trimUrl } from '@/core/extract/links';

const at = (iso: string) => new Date(iso).getTime();
const dates = (text: string, taken = '2026-11-18T10:00') =>
  extractDates(text, at(taken)).map((d) => d.normalized);

describe('dates', () => {
  it('runs in the pinned test time zone (tests/globalSetup.js)', () => {
    expect(new Date('2026-11-19T00:30').getTimezoneOffset()).toBe(-60);
  });

  it('resolves relative words against the local day of the screenshot, not UTC', () => {
    // 00:30 in Warsaw is still the previous day in UTC.
    expect(dates('завтра', '2026-11-19T00:30')).toEqual(['2026-11-20']);
    expect(dates('tomorrow', '2026-12-31T23:50')).toEqual(['2027-01-01']);
  });

  it('takes the screenshot day itself for its own weekday, otherwise the next one', () => {
    expect(dates('w środę')).toEqual(['2026-11-18']); // 2026-11-18 is a Wednesday
    expect(dates('во вторник')).toEqual(['2026-11-24']);
  });

  it('handles 12 AM / 12 PM', () => {
    expect(dates('Jan 2 at 12 am, Jan 3 at 12:15 PM')).toEqual([
      '2026-01-02T00:00',
      '2026-01-03T12:15',
    ]);
  });

  it('joins a time to the date before it, or the one after when none precedes', () => {
    expect(dates('o 8:00 w środę')).toEqual(['2026-11-18T08:00']);
    expect(dates('3 lipca, potem pojutrze o 8:00')).toEqual(['2026-07-03', '2026-11-20T08:00']);
  });

  it('ignores a clock without a date or preposition (status bar)', () => {
    expect(dates('14:05\n9:41 AM')).toEqual([]);
    expect(dates('Встреча в 14:05')).toEqual(['2026-11-18T14:05']);
  });

  it('rejects impossible dates', () => {
    expect(dates('30 февраля, 31 kwietnia, 2026-02-30, 32.01.2026')).toEqual([]);
  });

  it('does not read dates or phones inside links and emails', () => {
    const found = extractEntities(
      'https://example.com/2026-11-20/123456789 jan.31@example.com',
      at('2026-11-18T10:00'),
    );
    expect(found.map((e) => e.type)).toEqual(['link', 'email']);
  });
});

describe('links', () => {
  it('trims trailing punctuation but keeps balanced brackets', () => {
    expect(trimUrl('https://x.com/a.')).toBe('https://x.com/a');
    expect(trimUrl('https://x.com/a)».')).toBe('https://x.com/a');
    expect(trimUrl('https://x.org/wiki/A_(b))')).toBe('https://x.org/wiki/A_(b)');
  });

  it('adds https and lower-cases only scheme and host', () => {
    expect(normalizeUrl('Example.COM/Path')).toBe('https://example.com/Path');
    expect(normalizeUrl('HTTP://A.b/C')).toBe('http://a.b/C');
  });
});

describe('extractEntities', () => {
  it('keeps one entity per type and normalized value', () => {
    const found = extractEntities('mail a@b.com\nA@B.com again', at('2026-11-18T10:00'));
    expect(found).toEqual([{ type: 'email', value: 'a@b.com', normalized: 'a@b.com' }]);
  });

  it('finds nothing in empty text', () => {
    expect(extractEntities('', 0)).toEqual([]);
  });
});
