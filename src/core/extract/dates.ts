import { WB_END, WB_START, type ExtractedEntity } from './types';

// Month names as they appear in dates: English, Russian and Polish genitive ("12 марта",
// "12 marca"), plus common abbreviations. Values are 1-based months.
const MONTHS: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sept: 9,
  sep: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
  января: 1,
  янв: 1,
  февраля: 2,
  фев: 2,
  марта: 3,
  мар: 3,
  апреля: 4,
  апр: 4,
  мая: 5,
  июня: 6,
  июн: 6,
  июля: 7,
  июл: 7,
  августа: 8,
  авг: 8,
  сентября: 9,
  сент: 9,
  сен: 9,
  октября: 10,
  окт: 10,
  ноября: 11,
  нояб: 11,
  ноя: 11,
  декабря: 12,
  дек: 12,
  stycznia: 1,
  sty: 1,
  lutego: 2,
  lut: 2,
  marca: 3,
  kwietnia: 4,
  kwi: 4,
  maja: 5,
  maj: 5,
  czerwca: 6,
  cze: 6,
  lipca: 7,
  lip: 7,
  sierpnia: 8,
  sie: 8,
  września: 9,
  wrz: 9,
  października: 10,
  paź: 10,
  listopada: 11,
  lis: 11,
  grudnia: 12,
  gru: 12,
};

/** Days from the screenshot's day. */
const RELATIVE: Record<string, number> = {
  today: 0,
  tomorrow: 1,
  'day after tomorrow': 2,
  сегодня: 0,
  завтра: 1,
  послезавтра: 2,
  dziś: 0,
  dzisiaj: 0,
  jutro: 1,
  pojutrze: 2,
};

/** `Date.getDay()` numbers; ru/pl in nominative and accusative ("в среду", "w środę"). */
const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  воскресенье: 0,
  понедельник: 1,
  вторник: 2,
  среда: 3,
  среду: 3,
  четверг: 4,
  пятница: 5,
  пятницу: 5,
  суббота: 6,
  субботу: 6,
  niedziela: 0,
  niedzielę: 0,
  poniedziałek: 1,
  wtorek: 2,
  środa: 3,
  środę: 3,
  czwartek: 4,
  piątek: 5,
  sobota: 6,
  sobotę: 6,
};

function alternation(words: string[]): string {
  return [...words].sort((a, b) => b.length - a.length).join('|');
}

const MONTH = `(${alternation(Object.keys(MONTHS))})${WB_END}\\.?`;
const SP = '[ \\t]';
const ORD = '(?:st|nd|rd|th)?';

const PATTERNS: {
  kind: 'dmy' | 'ymd' | 'day-month' | 'month-day' | 'relative' | 'weekday';
  re: RegExp;
}[] = [
  { kind: 'ymd', re: new RegExp(`${WB_START}(\\d{4})-(\\d{2})-(\\d{2})(?!\\p{N})`, 'gu') },
  {
    kind: 'dmy',
    re: new RegExp(`${WB_START}(\\d{1,2})[./](\\d{1,2})[./](\\d{4}|\\d{2})(?!\\p{N})`, 'gu'),
  },
  {
    kind: 'day-month',
    re: new RegExp(
      `${WB_START}(\\d{1,2})${ORD}\\.?${SP}+${MONTH}(?:,?${SP}+(\\d{4})(?!\\p{N}))?`,
      'giu',
    ),
  },
  {
    kind: 'month-day',
    re: new RegExp(
      `${WB_START}${MONTH}${SP}+(\\d{1,2})${ORD}(?!\\p{N})(?:,?${SP}+(\\d{4})(?!\\p{N}))?`,
      'giu',
    ),
  },
  {
    kind: 'relative',
    re: new RegExp(`${WB_START}(${alternation(Object.keys(RELATIVE))})${WB_END}`, 'giu'),
  },
  {
    kind: 'weekday',
    re: new RegExp(`${WB_START}(${alternation(Object.keys(WEEKDAYS))})${WB_END}`, 'giu'),
  },
];

const TIME = new RegExp(
  `${WB_START}(?:([01]?\\d|2[0-3]):([0-5]\\d)(?:${SP}*([ap])\\.?m\\.?)?|(1[0-2]|0?[1-9])${SP}*([ap])\\.?m\\.?)(?![\\p{L}\\p{N}])`,
  'giu',
);

// A time alone counts as a date (on the screenshot's day) only after one of these words, so the
// clock in a status bar ("14:05") is not mistaken for an appointment.
const TIME_PREPOSITION =
  /(?:^|[\s(])(?:at|by|в|во|к|о|об|до|o|do|godz\.?|o godz\.?|godzinie)[ \t]+$/iu;

type Span = { start: number; end: number };
type DateHit = Span & { y: number; m: number; d: number };
type TimeHit = Span & { h: number; min: number; prepositioned: boolean };

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function isValid(y: number, m: number, d: number): boolean {
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

function shift(base: Date, days: number): { y: number; m: number; d: number } {
  const date = new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
  return { y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate() };
}

function overlaps(a: Span, spans: Span[]): boolean {
  return spans.some((b) => a.start < b.end && b.start < a.end);
}

function resolve(kind: (typeof PATTERNS)[number]['kind'], g: string[], base: Date) {
  const year = (raw: string | undefined) =>
    raw === undefined ? base.getFullYear() : raw.length === 2 ? 2000 + Number(raw) : Number(raw);
  switch (kind) {
    case 'ymd':
      return { y: Number(g[1]), m: Number(g[2]), d: Number(g[3]) };
    case 'dmy':
      return { y: year(g[3]), m: Number(g[2]), d: Number(g[1]) };
    case 'day-month':
      return { y: year(g[3]), m: MONTHS[g[2].toLowerCase()], d: Number(g[1]) };
    case 'month-day':
      return { y: year(g[3]), m: MONTHS[g[1].toLowerCase()], d: Number(g[2]) };
    case 'relative':
      return shift(base, RELATIVE[g[1].toLowerCase().replace(/\s+/g, ' ')]);
    case 'weekday': {
      // The next such day, counting the screenshot's own day ("w środę" written on a Wednesday).
      const target = WEEKDAYS[g[1].toLowerCase()];
      return shift(base, (target - base.getDay() + 7) % 7);
    }
  }
}

function datesInLine(line: string, base: Date): DateHit[] {
  const hits: DateHit[] = [];
  for (const { kind, re } of PATTERNS) {
    for (const m of line.matchAll(re)) {
      const span = { start: m.index, end: m.index + m[0].length };
      if (overlaps(span, hits)) continue;
      const { y, m: month, d } = resolve(kind, [...m] as string[], base);
      if (isValid(y, month, d)) hits.push({ ...span, y, m: month, d });
    }
  }
  return hits.sort((a, b) => a.start - b.start);
}

function timesInLine(line: string, dates: Span[]): TimeHit[] {
  const hits: TimeHit[] = [];
  for (const m of line.matchAll(TIME)) {
    const span = { start: m.index, end: m.index + m[0].length };
    if (overlaps(span, dates)) continue;
    let h = Number(m[1] ?? m[4]);
    const min = Number(m[2] ?? 0);
    const half = (m[3] ?? m[5])?.toLowerCase();
    if (half === 'p' && h < 12) h += 12;
    if (half === 'a' && h === 12) h = 0;
    hits.push({ ...span, h, min, prepositioned: TIME_PREPOSITION.test(line.slice(0, m.index)) });
  }
  return hits;
}

/**
 * Dates and times in ru/en/pl, resolved against the day the screenshot was taken (device local
 * time). Normalized as ISO 8601 local date (`2026-03-12`) or date-time (`2026-03-12T15:30`).
 * A year-less date gets the screenshot's year. A time on the same line joins the nearest date.
 */
export function extractDates(text: string, takenAt: number): ExtractedEntity[] {
  const base = new Date(takenAt);
  const result: ExtractedEntity[] = [];
  for (const line of text.split('\n')) {
    const dates = datesInLine(line, base);
    const times = timesInLine(line, dates);
    // A time joins the closest date before it ("Jan 2 at 12 am"), or if there is none, the closest
    // date after it ("o 8:00 w środę"); each date takes at most one time.
    const timeOf = new Map<DateHit, TimeHit>();
    const used = new Set<TimeHit>();
    for (const time of times) {
      const free = dates.filter((date) => !timeOf.has(date));
      const before = free.filter((d) => d.end <= time.start).sort((a, b) => b.end - a.end);
      const after = free.filter((d) => d.start >= time.end).sort((a, b) => a.start - b.start);
      const best = before[0] ?? after[0];
      if (best) {
        timeOf.set(best, time);
        used.add(time);
      }
    }
    const entries: { span: Span; date: { y: number; m: number; d: number }; time?: TimeHit }[] =
      dates.map((date) => ({ span: date, date, time: timeOf.get(date) }));
    for (const time of times) {
      if (!used.has(time) && time.prepositioned) {
        entries.push({ span: time, date: shift(base, 0), time });
      }
    }

    for (const { span, date, time } of entries.sort((a, b) => a.span.start - b.span.start)) {
      const start = Math.min(span.start, time?.start ?? Infinity);
      const end = Math.max(span.end, time?.end ?? 0);
      const day = `${date.y}-${pad(date.m)}-${pad(date.d)}`;
      result.push({
        type: 'date',
        value: line.slice(start, end),
        normalized: time ? `${day}T${pad(time.h)}:${pad(time.min)}` : day,
        extra: { hasTime: Boolean(time) },
      });
    }
  }
  return result;
}
