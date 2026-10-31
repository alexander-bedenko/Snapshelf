import { Linking } from 'react-native';

import { createLibraryStore, type LibraryStore } from '@/core/library/libraryStore';
import { ScreenshotPipeline } from '@/core/pipeline/ScreenshotPipeline';
import { openRepository } from '@/data/openRepository';
import { createAndroidScreenshotSource } from '@/platform/media/android/createAndroidScreenshotSource';
import { MlKitLatinOcrEngine } from '@/platform/ocr/android/MlKitLatinOcrEngine';

let pending: Promise<LibraryStore> | null = null;

/** Composition root: builds the real DB, source, OCR engine and pipeline once per app run. */
export function getLibraryStore(): Promise<LibraryStore> {
  pending ??= (async () => {
    const repo = await openRepository();
    const source = createAndroidScreenshotSource();
    const pipeline = new ScreenshotPipeline(
      { source, ocr: new MlKitLatinOcrEngine(), repo },
      { onError: (error) => console.warn('pipeline error', String(error)) },
    );
    return createLibraryStore({ source, repo, pipeline });
  })();
  return pending;
}

export function openAppSettings(): void {
  void Linking.openSettings();
}
