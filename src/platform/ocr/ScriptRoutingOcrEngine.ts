import { cyrillicShare } from '@/core/text/script';
import type { OcrResult } from '@/core/types';

import type { OcrEngine } from './OcrEngine';

export type ScriptRoutingOptions = {
  /**
   * Keep the multi-script result when at least this share of its letters is Cyrillic.
   * Below it the screenshot is treated as Latin (en/pl) and the Latin engine's text is used.
   */
  minCyrillicShare?: number;
};

export const DEFAULT_MIN_CYRILLIC_SHARE = 0.3;

/**
 * Chooses the OCR engine per screenshot by detected script (CLAUDE.md section 7):
 * 1. the multi-script engine (Tesseract rus+eng+pol) reads the image;
 * 2. mostly Cyrillic text → its result is kept;
 * 3. otherwise the Latin engine (ML Kit, more accurate for en/pl) reads the image and wins.
 * If one engine fails, the other one's result is used; only when both fail does it throw.
 */
export class ScriptRoutingOcrEngine implements OcrEngine {
  private readonly minCyrillicShare: number;

  constructor(
    private readonly multiScript: OcrEngine,
    private readonly latin: OcrEngine,
    options: ScriptRoutingOptions = {},
  ) {
    this.minCyrillicShare = options.minCyrillicShare ?? DEFAULT_MIN_CYRILLIC_SHARE;
  }

  async recognize(imageUri: string, langHints: string[]): Promise<OcrResult> {
    let first: OcrResult | null = null;
    let firstError: unknown = null;
    try {
      first = await this.multiScript.recognize(imageUri, langHints);
      if (cyrillicShare(first.text) >= this.minCyrillicShare) return first;
    } catch (error) {
      firstError = error;
    }

    try {
      const latin = await this.latin.recognize(imageUri, langHints);
      return { ...latin, durationMs: latin.durationMs + (first?.durationMs ?? 0) };
    } catch (error) {
      if (first) return first;
      throw new Error(`All OCR engines failed: ${message(firstError)}; ${message(error)}`);
    }
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
