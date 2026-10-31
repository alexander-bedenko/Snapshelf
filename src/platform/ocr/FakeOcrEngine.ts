import type { OcrResult } from '@/core/types';

import type { OcrEngine } from './OcrEngine';

export class FakeOcrEngine implements OcrEngine {
  readonly calls: { imageUri: string; langHints: string[] }[] = [];

  constructor(private readonly texts: Record<string, string> = {}) {}

  async recognize(imageUri: string, langHints: string[]): Promise<OcrResult> {
    this.calls.push({ imageUri, langHints });
    const text = this.texts[imageUri];
    if (text === undefined) {
      throw new Error(`FakeOcrEngine: no text configured for ${imageUri}`);
    }
    return { text, engine: 'fake', durationMs: 0 };
  }
}
