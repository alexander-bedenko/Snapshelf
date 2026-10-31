const {
  normalize,
  levenshtein,
  cer,
  characterErrors,
  languageOf,
  summarize,
} = require('./accuracy');

describe('ocr accuracy', () => {
  it('computes edit distance over code points', () => {
    expect(levenshtein('', '')).toBe(0);
    expect(levenshtein('abc', 'abc')).toBe(0);
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('привет', 'првет')).toBe(1);
    expect(levenshtein('żółw', 'zolw')).toBe(3);
  });

  it('normalizes whitespace and unicode form', () => {
    expect(normalize('  a \n\n b\t c ')).toBe('a b c');
    expect(normalize('e\u0301')).toBe('\u00e9');
  });

  it('ignores line break differences', () => {
    expect(cer('Hello\nworld', 'Hello world')).toBe(0);
  });

  it('computes CER relative to the reference length', () => {
    expect(cer('abcd', 'abXd')).toBeCloseTo(0.25);
    expect(cer('abcd', '')).toBe(1);
    expect(cer('', '')).toBe(0);
    expect(characterErrors('abcd', 'abXd')).toEqual({ distance: 1, refLength: 4 });
  });

  it('aggregates per language weighted by reference length', () => {
    expect(languageOf('ru-notes')).toBe('ru');
    const s = summarize([
      { name: 'ru-a', distance: 5, refLength: 10 },
      { name: 'ru-b', distance: 0, refLength: 90 },
      { name: 'en-a', distance: 0, refLength: 50 },
    ]);
    expect(s.ru.cer).toBeCloseTo(0.05);
    expect(s.ru.count).toBe(2);
    expect(s.en.cer).toBe(0);
  });
});
