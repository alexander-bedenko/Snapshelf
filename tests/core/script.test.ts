import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { cyrillicShare, scriptStats } from '@/core/text/script';

const fixture = (name: string) =>
  readFileSync(join(__dirname, '..', 'fixtures', 'screenshots', `${name}.expected.txt`), 'utf8');

describe('scriptStats', () => {
  it('counts Cyrillic and Latin letters only', () => {
    expect(scriptStats('Привет, Bob! 10:00 ёЁ żółć')).toEqual({ cyrillic: 8, latin: 7 });
    expect(scriptStats('123 !? 😀 東京')).toEqual({ cyrillic: 0, latin: 0 });
  });
});

describe('cyrillicShare', () => {
  it('is 0 without letters and 1 for pure Russian', () => {
    expect(cyrillicShare('')).toBe(0);
    expect(cyrillicShare('12:30 +7 912')).toBe(0);
    expect(cyrillicShare('Купить молоко')).toBe(1);
  });

  it.each([
    ['ru-notes', 0.6, 1],
    ['ru-chat', 0.6, 1],
    ['en-article', 0, 0],
    ['en-settings', 0, 0],
    ['pl-todo', 0, 0],
    ['pl-message', 0, 0],
  ])('fixture %s is between %d and %d', (name, min, max) => {
    const share = cyrillicShare(fixture(name));
    expect(share).toBeGreaterThanOrEqual(min);
    expect(share).toBeLessThanOrEqual(max);
  });
});
