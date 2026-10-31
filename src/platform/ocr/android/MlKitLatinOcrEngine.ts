import ScreenshotOcr from '../../../../modules/screenshot-ocr';

import type { OcrResult } from '@/core/types';

import type { OcrEngine } from '../OcrEngine';

export class MlKitLatinOcrEngine implements OcrEngine {
  // ML Kit's Latin recognizer takes no language hints: it covers en/pl, not Cyrillic.
  async recognize(imageUri: string, _langHints: string[]): Promise<OcrResult> {
    return ScreenshotOcr.recognize(imageUri, 'mlkit-latin');
  }
}
