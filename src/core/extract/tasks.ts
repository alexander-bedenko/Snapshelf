import { WB_END, WB_START, type ExtractedEntity, type TaskExtra } from './types';

const CHECKBOX = /^(?:[-*•][ \t]*)?(?:\[([ xX✓✔])?\]|([☐□▢])|([☑☒✅✓✔]))[ \t]*/u;
const BULLET = /^(?:[-–—•·*▪◦‣]|\d{1,2}[.)])[ \t]+/u;
const KEYWORD = new RegExp(
  `${WB_START}(?:todo|to-do|нужно|надо|need to|needs to|trzeba)${WB_END}`,
  'iu',
);

// Words that end like an infinitive but are not verbs.
const RU_NOT_VERBS = new Set([
  'часть',
  'путь',
  'сеть',
  'власть',
  'смерть',
  'память',
  'есть',
  'мать',
  'тетрадь',
  'площадь',
  'лошадь',
  'кровать',
  'печать',
  'ночь',
  'дочь',
  'речь',
  'печь',
  'мощь',
  'вещь',
  'помощь',
]);
const PL_NOT_VERBS = new Set([
  'cześć',
  'część',
  'pięć',
  'sześć',
  'dziewięć',
  'dziesięć',
  'pamięć',
  'śmierć',
  'ćwierć',
  'płeć',
  'nić',
  'chęć',
  'zemść',
]);
// English imperatives count only after a bullet: without one, lines like "Call us: ..." in an
// article would become tasks.
const EN_VERBS = new Set([
  'buy',
  'call',
  'send',
  'pay',
  'book',
  'check',
  'review',
  'email',
  'write',
  'finish',
  'fix',
  'order',
  'schedule',
  'submit',
  'prepare',
  'pick',
  'bring',
  'return',
  'cancel',
  'renew',
  'sign',
  'update',
  'clean',
  'ask',
  'reply',
  'remind',
  'print',
  'file',
  'plan',
  'visit',
  'meet',
]);
const MAX_WORDS = 10;

function startsWithVerb(line: string, bulleted: boolean): boolean {
  if (line.endsWith('?')) return false;
  const words = line.split(/\s+/);
  if (words.length > MAX_WORDS) return false;
  const first = (words[0] ?? '').toLowerCase().replace(/[^\p{L}-]/gu, '');
  if (/^\p{Script=Cyrillic}{2,}(?:ть|ться|чь)$/u.test(first)) return !RU_NOT_VERBS.has(first);
  if (/^\p{Script=Latin}{2,}ć$/u.test(first))
    return !first.endsWith('ość') && !PL_NOT_VERBS.has(first);
  return bulleted && EN_VERBS.has(first);
}

/**
 * Tasks, one per line, by explainable rules (CLAUDE.md section 8):
 * - `checkbox`: line starts with a checkbox glyph or `[ ]` / `[x]` (checked ones are `done`);
 * - `keyword`: TODO, нужно/надо, need to, trzeba;
 * - `verb`: line starts with a ru/pl infinitive ("Купить…", "Zadzwonić…"), or with an English
 *   imperative after a bullet; short lines only, not questions.
 */
export function extractTasks(text: string): ExtractedEntity[] {
  const result: ExtractedEntity[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    let extra: TaskExtra | null = null;
    let body = line;

    const box = line.match(CHECKBOX);
    if (box) {
      body = line.slice(box[0].length).trim();
      const checked = box[3] !== undefined || (box[1] !== undefined && box[1] !== ' ');
      if (body) extra = { rule: 'checkbox', done: checked };
    } else {
      const bullet = line.match(BULLET);
      body = bullet ? line.slice(bullet[0].length).trim() : line;
      if (KEYWORD.test(body)) extra = { rule: 'keyword', done: false };
      else if (startsWithVerb(body, Boolean(bullet))) extra = { rule: 'verb', done: false };
    }
    if (extra) result.push({ type: 'task', value: line, normalized: body, extra });
  }
  return result;
}
