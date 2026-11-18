import { buildFtsQuery, foldForSearch, MAX_QUERY_TERMS } from '@/core/search/query';

describe('foldForSearch', () => {
  it('folds Polish ł/Ł, which FTS5 remove_diacritics cannot', () => {
    expect(foldForSearch('Zażółć gęślą jaźń. ŁÓDŹ')).toBe('Zażólć gęślą jaźń. LÓDŹ');
  });

  it('normalizes decomposed input to NFC', () => {
    const decomposed = 'zażółć';
    expect(foldForSearch(decomposed)).toBe('zażólć');
  });

  it('folds Cyrillic ё/Ё to е/Е and keeps й', () => {
    expect(foldForSearch('Всё ЁЛКА отчёт мой')).toBe('Все ЕЛКА отчет мой');
  });

  it('leaves other Cyrillic and Latin text alone', () => {
    expect(foldForSearch('Купить молоко, call Bob')).toBe('Купить молоко, call Bob');
  });
});

describe('buildFtsQuery', () => {
  it('turns words into AND-ed prefix terms', () => {
    expect(buildFtsQuery('meeting tomorrow')).toBe('"meeting"* "tomorrow"*');
  });

  it('lower-cases, folds ł/ё and removes duplicates', () => {
    expect(buildFtsQuery('Łódź łódź')).toBe('"lódź"*');
    expect(buildFtsQuery('Отчёт отчет')).toBe('"отчет"*');
  });

  it('keeps Cyrillic and digits, splits on punctuation', () => {
    expect(buildFtsQuery('Завтра в 10:00!')).toBe('"завтра"* "в"* "10"* "00"*');
    expect(buildFtsQuery('example.com/path')).toBe('"example"* "com"* "path"*');
  });

  it('drops FTS5 syntax so user input can never break the query', () => {
    expect(buildFtsQuery('"a" OR b* NEAR(c) -d ^e:f')).toBe(
      '"a"* "or"* "b"* "near"* "c"* "d"* "e"* "f"*',
    );
  });

  it('returns null when there is nothing to search for', () => {
    expect(buildFtsQuery('')).toBeNull();
    expect(buildFtsQuery('   ')).toBeNull();
    expect(buildFtsQuery('?!-*"()')).toBeNull();
  });

  it('caps the number of terms', () => {
    const words = Array.from({ length: 20 }, (_, i) => `w${i}`).join(' ');
    expect(buildFtsQuery(words)?.split(' ')).toHaveLength(MAX_QUERY_TERMS);
  });
});
