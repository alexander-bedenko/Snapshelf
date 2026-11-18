/**
 * @jest-environment node
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { extractEntities } from '@/core/extract';

const DIR = join(__dirname, '..', 'fixtures', 'ocr-text');

const cases = readdirSync(DIR)
  .filter((f) => f.endsWith('.txt'))
  .sort()
  .map((f) => f.replace(/\.txt$/, ''));

describe('extraction fixtures (CLAUDE.md section 8)', () => {
  it('has fixtures for ru/en/pl screenshots and for every entity type', () => {
    expect(cases).toEqual(
      expect.arrayContaining(['en-article', 'pl-todo', 'ru-notes', 'links-edge', 'dates-edge']),
    );
  });

  it.each(cases)('%s', (name) => {
    const text = readFileSync(join(DIR, `${name}.txt`), 'utf8');
    const expected = JSON.parse(readFileSync(join(DIR, `${name}.expected.json`), 'utf8')) as {
      takenAt: string;
      entities: unknown[];
    };

    const actual = extractEntities(text, new Date(expected.takenAt).getTime());

    expect(actual).toEqual(expected.entities);
  });
});
