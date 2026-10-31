import { PermissionsAndroid, Platform } from 'react-native';

import ScreenshotMedia from '../../../../modules/screenshot-media';

import { AndroidScreenshotSource } from './AndroidScreenshotSource';

export function createAndroidScreenshotSource(): AndroidScreenshotSource {
  return new AndroidScreenshotSource({
    native: ScreenshotMedia,
    permissions: {
      check: (permission) =>
        PermissionsAndroid.check(permission as Parameters<typeof PermissionsAndroid.check>[0]),
      request: async (permission) => {
        const result = await PermissionsAndroid.request(
          permission as Parameters<typeof PermissionsAndroid.request>[0],
        );
        return result;
      },
    },
    apiLevel: Number(Platform.Version),
  });
}
