import { PermissionDeniedError } from '@/core/types';
import type { PermissionState, ScreenshotRef, Unsub } from '@/core/types';

import type { ScreenshotSource } from '../ScreenshotSource';

export type NativeScreenshotMedia = {
  listScreenshots(sinceMs: number): Promise<ScreenshotRef[]>;
  addListener(event: 'onMediaChanged', listener: () => void): { remove(): void };
};

export type PermissionsApi = {
  check(permission: string): Promise<boolean>;
  request(permission: string): Promise<'granted' | 'denied' | 'never_ask_again'>;
};

export type AndroidSourceDeps = {
  native: NativeScreenshotMedia;
  permissions: PermissionsApi;
  /** `Platform.Version` on Android: the API level. */
  apiLevel: number;
  debounceMs?: number;
};

const READ_MEDIA_IMAGES = 'android.permission.READ_MEDIA_IMAGES';
const READ_EXTERNAL_STORAGE = 'android.permission.READ_EXTERNAL_STORAGE';

export class AndroidScreenshotSource implements ScreenshotSource {
  private readonly permission: string;
  private readonly debounceMs: number;

  constructor(private readonly deps: AndroidSourceDeps) {
    // Android 13+ split storage access into per-type permissions.
    this.permission = deps.apiLevel >= 33 ? READ_MEDIA_IMAGES : READ_EXTERNAL_STORAGE;
    this.debounceMs = deps.debounceMs ?? 500;
  }

  async getPermission(): Promise<PermissionState> {
    // Android cannot tell "never asked" from "denied" without asking, so not-granted is undetermined.
    return (await this.deps.permissions.check(this.permission)) ? 'granted' : 'undetermined';
  }

  async requestPermission(): Promise<PermissionState> {
    const result = await this.deps.permissions.request(this.permission);
    if (result === 'granted') return 'granted';
    return result === 'never_ask_again' ? 'blocked' : 'denied';
  }

  async listScreenshots(since = 0): Promise<ScreenshotRef[]> {
    try {
      return await this.deps.native.listScreenshots(since);
    } catch (error) {
      if (isPermissionError(error)) throw new PermissionDeniedError();
      throw error;
    }
  }

  onNew(cb: (refs: ScreenshotRef[]) => void): Unsub {
    // Slack covers a screenshot taken between the initial scan and subscribing.
    let lastSeen = Date.now() - 60_000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const scan = async () => {
      try {
        const refs = await this.listScreenshots(lastSeen);
        if (stopped || refs.length === 0) return;
        lastSeen = Math.max(lastSeen, ...refs.map((r) => r.takenAt));
        cb(refs);
      } catch {
        // Permission lost or a transient MediaStore error: the next change or app start rescans.
      }
    };

    const subscription = this.deps.native.addListener('onMediaChanged', () => {
      clearTimeout(timer);
      timer = setTimeout(scan, this.debounceMs);
    });

    return () => {
      stopped = true;
      clearTimeout(timer);
      subscription.remove();
    };
  }
}

function isPermissionError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === 'ERR_PERMISSION_DENIED';
}
