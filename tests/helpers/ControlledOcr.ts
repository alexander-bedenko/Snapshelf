import type { OcrResult } from '@/core/types';
import type { OcrEngine } from '@/platform/ocr/OcrEngine';

/** OCR double that records concurrency and lets a test decide when each call finishes. */
export class ControlledOcr implements OcrEngine {
  readonly calls: string[] = [];
  inFlight = 0;
  maxInFlight = 0;
  private gates = new Map<string, () => void>();
  private failures = new Map<string, string>();
  private texts = new Map<string, string>();
  /** When true, calls wait until `release(uri)` / `releaseAll()`. */
  manual = false;
  private held: string[] = [];

  setText(uri: string, text: string): void {
    this.texts.set(uri, text);
  }

  failWith(uri: string, message: string): void {
    this.failures.set(uri, message);
  }

  clearFailure(uri: string): void {
    this.failures.delete(uri);
  }

  get heldUris(): string[] {
    return [...this.held];
  }

  release(uri: string): void {
    this.gates.get(uri)?.();
  }

  releaseAll(): void {
    for (const gate of [...this.gates.values()]) gate();
  }

  async recognize(imageUri: string): Promise<OcrResult> {
    this.calls.push(imageUri);
    this.inFlight++;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    try {
      if (this.manual) {
        this.held.push(imageUri);
        await new Promise<void>((resolve) => this.gates.set(imageUri, resolve));
        this.held = this.held.filter((u) => u !== imageUri);
        this.gates.delete(imageUri);
      } else {
        await Promise.resolve();
      }
      const failure = this.failures.get(imageUri);
      if (failure) throw new Error(failure);
      return {
        text: this.texts.get(imageUri) ?? `text of ${imageUri}`,
        engine: 'test',
        durationMs: 1,
      };
    } finally {
      this.inFlight--;
    }
  }
}
