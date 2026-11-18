const {
  normalize,
  levenshtein,
  cer,
  characterErrors,
  languageOf,
  summarize,
  parseLog,
  selectRun,
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

describe('ocr log parsing', () => {
  const log = [
    'I ReactNativeJS: OCR_SPIKE {"name":"ru-notes","run":"tesseract","engine":"tesseract","text":"a"}',
    'I ReactNativeJS: OCR_SPIKE {"name":"ru-notes","run":"mlkit-latin","engine":"mlkit-latin","text":"b"}',
    'I ReactNativeJS: OCR_SPIKE {"name":"ru-notes","run":"routed","engine":"tesseract","text":"c"}',
    'I ReactNativeJS: OCR_SPIKE {"name":"en-article","run":"routed","error":"boom"}',
    'I ReactNativeJS: OCR_SPIKE {"name":"truncated","run":"rou',
    'I ReactNativeJS: OCR_SPIKE_DONE',
  ].join('\n');

  it('keeps one item per run and fixture', () => {
    expect(parseLog(log)).toHaveLength(4);
  });

  it('selects a run by its id, not by the engine that answered', () => {
    const routed = selectRun(parseLog(log), 'routed');
    expect(routed.id).toBe('routed');
    expect(routed.items.map((i) => i.text ?? i.error)).toEqual(['c', 'boom']);
  });

  it('asks for --engine when several runs are present', () => {
    expect(selectRun(parseLog(log)).error).toMatch(/several runs/);
    expect(selectRun(parseLog(log), 'nope').error).toMatch(/no results/);
  });

  it('reads old single-engine results without a run id', () => {
    const old = [
      { name: 'ru-notes', engine: 'mlkit-latin', text: 'x' },
      { name: 'en-article', error: 'boom' },
    ];
    expect(selectRun(old)).toMatchObject({ id: 'mlkit-latin', items: old });
  });
});
