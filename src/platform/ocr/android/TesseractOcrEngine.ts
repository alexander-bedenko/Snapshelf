import ScreenshotOcr from '../../../../modules/screenshot-ocr';

import type { OcrResult } from '@/core/types';

import type { OcrEngine } from '../OcrEngine';

export class TesseractOcrEngine implements OcrEngine {
  // The native side always loads the bundled rus+eng+pol models; hints are not needed.
  async recognize(imageUri: string, _langHints: string[]): Promise<OcrResult> {
    return ScreenshotOcr.recognize(imageUri, 'tesseract');
  }
}
