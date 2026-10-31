import { PermissionDeniedError } from '@/core/types';
import type { PermissionState, ScreenshotRef, Unsub } from '@/core/types';

import type { ScreenshotSource } from './ScreenshotSource';

export class FakeScreenshotSource implements ScreenshotSource {
  permission: PermissionState;
  /** What the "system dialog" answers when `requestPermission` is called. */
  requestResult: PermissionState = 'granted';
  screenshots: ScreenshotRef[];
  requestCount = 0;
  listCount = 0;
  private listeners = new Set<(refs: ScreenshotRef[]) => void>();

  constructor(options: { permission?: PermissionState; screenshots?: ScreenshotRef[] } = {}) {
    this.permission = options.permission ?? 'granted';
    this.screenshots = options.screenshots ?? [];
  }

  async getPermission(): Promise<PermissionState> {
    return this.permission;
  }

  async requestPermission(): Promise<PermissionState> {
    this.requestCount++;
    this.permission = this.requestResult;
    return this.permission;
  }

  async listScreenshots(since = 0): Promise<ScreenshotRef[]> {
    this.listCount++;
    if (this.permission !== 'granted') throw new PermissionDeniedError();
    return this.screenshots.filter((s) => s.takenAt >= since);
  }

  onNew(cb: (refs: ScreenshotRef[]) => void): Unsub {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  emitNew(refs: ScreenshotRef[]): void {
    this.screenshots = [...this.screenshots, ...refs];
    for (const listener of this.listeners) listener(refs);
  }

  get listenerCount(): number {
    return this.listeners.size;
  }
}
