import { router, useLocalSearchParams } from 'expo-router';
import { Linking } from 'react-native';

import { ScreenshotDetailScreen } from '@/ui/ScreenshotDetailScreen';
import { getRepository } from '@/ui/services';
import { deviceLocale, getStrings } from '@/ui/strings';
import { useScreenshotDetail, type DetailDeps } from '@/ui/useScreenshotDetail';

const strings = getStrings(deviceLocale());
const deps: DetailDeps = { getRepository, openUrl: (url) => Linking.openURL(url) };

export default function ScreenshotDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const detail = useScreenshotDetail(String(id), deps, strings);

  return (
    <ScreenshotDetailScreen
      actions={{
        press: (entity) => void detail.press(entity),
        back: () => (router.canGoBack() ? router.back() : router.replace('/')),
      }}
      entities={detail.entities}
      error={detail.error}
      loading={detail.loading}
      record={detail.record}
      strings={strings}
    />
  );
}
