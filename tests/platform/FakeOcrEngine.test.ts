import { FakeOcrEngine } from '@/platform/ocr/FakeOcrEngine';

describe('FakeOcrEngine', () => {
  it('returns configured text and records calls', async () => {
    const engine = new FakeOcrEngine({ 'file:///a.png': 'Привет мир' });

    const result = await engine.recognize('file:///a.png', ['ru']);

    expect(result.text).toBe('Привет мир');
    expect(result.engine).toBe('fake');
    expect(engine.calls).toEqual([{ imageUri: 'file:///a.png', langHints: ['ru'] }]);
  });

  it('rejects for an unknown image', async () => {
    await expect(new FakeOcrEngine().recognize('file:///x.png', [])).rejects.toThrow(
      'no text configured',
    );
  });
});
