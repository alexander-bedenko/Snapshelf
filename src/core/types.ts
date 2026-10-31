export type OcrResult = {
  text: string;
  engine: string;
  durationMs: number;
};

export type Unsub = () => void;

export type ScreenshotStatus = 'pending' | 'processing' | 'done' | 'failed';

// "blocked" = denied with "don't ask again": only the system settings can grant it.
export type PermissionState = 'granted' | 'denied' | 'blocked' | 'undetermined';

export type ScreenshotRef = {
  id: string;
  uri: string;
  takenAt: number;
  width: number;
  height: number;
};

export type ScreenshotRecord = ScreenshotRef & {
  status: ScreenshotStatus;
  ocrText: string | null;
  topic: string | null;
  processedAt: number | null;
  error: string | null;
  attempts: number;
  nextRetryAt: number | null;
};

export class PermissionDeniedError extends Error {
  constructor(message = 'Media permission is not granted') {
    super(message);
    this.name = 'PermissionDeniedError';
  }
}
