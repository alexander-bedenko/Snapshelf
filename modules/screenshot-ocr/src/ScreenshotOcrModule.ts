import { requireNativeModule } from 'expo';

export type NativeOcrResult = {
  text: string;
  engine: string;
  durationMs: number;
};

type ScreenshotOcrNativeModule = {
  recognize(imageUri: string, engine: string): Promise<NativeOcrResult>;
};

export default requireNativeModule<ScreenshotOcrNativeModule>('ScreenshotOcr');
