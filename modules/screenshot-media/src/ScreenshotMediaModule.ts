import { requireNativeModule, type NativeModule } from 'expo';

import type { ScreenshotRef } from '../../../src/core/types';

type ScreenshotMediaEvents = {
  onMediaChanged: () => void;
};

declare class ScreenshotMediaNativeModule extends NativeModule<ScreenshotMediaEvents> {
  listScreenshots(sinceMs: number): Promise<ScreenshotRef[]>;
}

export default requireNativeModule<ScreenshotMediaNativeModule>('ScreenshotMedia');
