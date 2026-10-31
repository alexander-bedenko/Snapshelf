import type { OcrResult } from '@/core/types';

export interface OcrEngine {
  recognize(imageUri: string, langHints: string[]): Promise<OcrResult>;
}
