import type { OcrResult } from '@/core/types';
import type { OcrEngine } from '@/platform/ocr/OcrEngine';
import { ScriptRoutingOcrEngine } from '@/platform/ocr/ScriptRoutingOcrEngine';

class StubEngine implements OcrEngine {
  readonly calls: string[] = [];
  constructor(
    private readonly engine: string,
    private readonly answer: (uri: string) => string | Error,
    private readonly durationMs = 100,
  ) {}

  async recognize(imageUri: string): Promise<OcrResult> {
    this.calls.push(imageUri);
    const answer = this.answer(imageUri);
    if (answer instanceof Error) throw answer;
    return { text: answer, engine: this.engine, durationMs: this.durationMs };
  }
}

const HINTS = ['ru', 'en', 'pl'];

function setup(
  tess: (uri: string) => string | Error,
  latin: (uri: string) => string | Error,
  minCyrillicShare?: number,
) {
  const tesseract = new StubEngine('tesseract', tess, 900);
  const mlkit = new StubEngine('mlkit-latin', latin, 300);
  const engine = new ScriptRoutingOcrEngine(tesseract, mlkit, { minCyrillicShare });
  return { tesseract, mlkit, engine };
}

describe('ScriptRoutingOcrEngine', () => {
  it('keeps the Tesseract result for Russian text and skips ML Kit', async () => {
    const { engine, mlkit } = setup(
      () => 'Заметки\nКупить молоко https://example.com',
      () => '3ameTKM',
    );

    await expect(engine.recognize('u1', HINTS)).resolves.toEqual({
      text: 'Заметки\nКупить молоко https://example.com',
      engine: 'tesseract',
      durationMs: 900,
    });
    expect(mlkit.calls).toEqual([]);
  });

  it('uses ML Kit for Latin text and counts both engines in the duration', async () => {
    const { engine } = setup(
      () => 'Zazolc gesla jazn',
      () => 'Zażółć gęślą jaźń',
    );

    await expect(engine.recognize('u1', HINTS)).resolves.toEqual({
      text: 'Zażółć gęślą jaźń',
      engine: 'mlkit-latin',
      durationMs: 1200,
    });
  });

  it('routes mixed text by the Cyrillic share threshold', async () => {
    // 6 Cyrillic of 18 letters ≈ 0.33
    const mixed = () => 'Привет meeting notes';
    const keep = setup(mixed, () => 'latin', 0.3);
    const drop = setup(mixed, () => 'latin', 0.5);

    expect((await keep.engine.recognize('u', HINTS)).engine).toBe('tesseract');
    expect((await drop.engine.recognize('u', HINTS)).engine).toBe('mlkit-latin');
  });

  it('falls back to ML Kit when Tesseract fails', async () => {
    const { engine } = setup(
      () => new Error('tessdata missing'),
      () => 'Settings',
    );

    await expect(engine.recognize('u', HINTS)).resolves.toMatchObject({
      text: 'Settings',
      engine: 'mlkit-latin',
      durationMs: 300,
    });
  });

  it('keeps the Tesseract text when ML Kit fails on a Latin screenshot', async () => {
    const { engine } = setup(
      () => 'Settings',
      () => new Error('mlkit down'),
    );

    await expect(engine.recognize('u', HINTS)).resolves.toMatchObject({
      text: 'Settings',
      engine: 'tesseract',
    });
  });

  it('fails with both reasons when both engines fail', async () => {
    const { engine } = setup(
      () => new Error('tess broke'),
      () => new Error('mlkit broke'),
    );

    await expect(engine.recognize('u', HINTS)).rejects.toThrow(
      'All OCR engines failed: tess broke; mlkit broke',
    );
  });
});
