import { normalizeOcrText } from '@/core/pipeline/normalize';

describe('normalizeOcrText', () => {
  it('trims and collapses horizontal whitespace, keeping line structure', () => {
    expect(normalizeOcrText('  Hello \t  world  \n\n\n  second   line \n')).toBe(
      'Hello world\nsecond line',
    );
  });

  it('unifies line endings', () => {
    expect(normalizeOcrText('a\r\nb\rc')).toBe('a\nb\nc');
  });

  it('joins words hyphenated across lines (ru, pl, en)', () => {
    expect(normalizeOcrText('пере-\nнос слова')).toBe('перенос слова');
    expect(normalizeOcrText('zadzwo-\nnić jutro')).toBe('zadzwonić jutro');
    expect(normalizeOcrText('screen-\nshot')).toBe('screenshot');
  });

  it('keeps a hyphen before an uppercase letter or a number', () => {
    expect(normalizeOcrText('Wi-\nFi')).toBe('Wi-\nFi');
    expect(normalizeOcrText('item-\n2')).toBe('item-\n2');
  });

  it('removes soft hyphens and treats non-breaking spaces as spaces', () => {
    expect(normalizeOcrText('co\u00ADoperate\u00A0now')).toBe('cooperate now');
  });

  it('returns an empty string for whitespace-only input', () => {
    expect(normalizeOcrText(' \n\t \n')).toBe('');
  });
});
