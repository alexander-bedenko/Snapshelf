/**
 * @jest-environment node
 */
import { foldForSearch } from '@/core/search/query';
import { openTestRepo } from '../helpers/nodeSqlite';

// M3 "Done when": query latency < 100 ms on 5,000 synthetic rows. Measured in Node with its
// bundled SQLite (not expo-sqlite on a phone), so it is a regression guard, not a device number.
const ROWS = 5000;
const BUDGET_MS = 100;

const VOCAB = (
  'meeting invoice deadline project review notes call report order delivery payment ' +
  'встреча счёт отчёт проект заметки звонок заказ доставка оплата договор понедельник ' +
  'spotkanie faktura termin projekt zakupy łódź dziękuję wiadomość środa jutro zażółć'
).split(' ');

/** Deterministic pseudo-random generator so every run measures the same data. */
function lcg(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

describe('search latency', () => {
  it(`stays under ${BUDGET_MS} ms per query on ${ROWS} rows`, async () => {
    const { db, repo } = await openTestRepo();
    const random = lcg(42);
    await db.transaction(async (tx) => {
      for (let i = 0; i < ROWS; i++) {
        const words = Array.from(
          { length: 40 + Math.floor(random() * 80) },
          () => VOCAB[Math.floor(random() * VOCAB.length)] + (random() < 0.2 ? i % 97 : ''),
        );
        const text = words.join(' ');
        await tx.run(
          `INSERT INTO screenshots (id, uri, taken_at, status, ocr_text, search_text)
           VALUES (?, ?, ?, 'done', ?, ?)`,
          [`r${i}`, `content://x/${i}`, i, text, foldForSearch(text)],
        );
      }
    });

    const queries = [
      'invoice',
      'отчет',
      'lodz',
      'zazolc',
      'meeting deadline',
      'встреча понедельник',
      'pr',
      'за',
      'faktura termin jutro',
      'nothingmatches',
    ];
    await repo.search('warm up');

    const timings: number[] = [];
    for (const query of queries) {
      const started = performance.now();
      const results = await repo.search(query);
      timings.push(performance.now() - started);
      if (query !== 'nothingmatches') expect(results.length).toBeGreaterThan(0);
    }

    const worst = Math.max(...timings);
    // Printed so the number can be copied into docs/STATUS.md.
    console.log(
      `search latency on ${ROWS} rows: worst ${worst.toFixed(1)} ms, ` +
        `per query ${timings.map((t) => t.toFixed(1)).join(', ')}`,
    );
    expect(worst).toBeLessThan(BUDGET_MS);
  }, 30000);
});
