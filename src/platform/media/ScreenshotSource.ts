import type { PermissionState, ScreenshotRef, Unsub } from '@/core/types';

export interface ScreenshotSource {
  getPermission(): Promise<PermissionState>;
  /** Shows the system dialog; call only after explaining why the access is needed. */
  requestPermission(): Promise<PermissionState>;
  /** Throws `PermissionDeniedError` when access is not granted. */
  listScreenshots(since?: number): Promise<ScreenshotRef[]>;
  onNew(cb: (refs: ScreenshotRef[]) => void): Unsub;
}
