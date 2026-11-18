import { router, useLocalSearchParams } from 'expo-router';
import { Linking } from 'react-native';

import { ScreenshotDetailScreen } from '@/ui/ScreenshotDetailScreen';
import { getLibraryStore, getRepository } from '@/ui/services';
import { deviceLocale, getStrings } from '@/ui/strings';
import { useScreenshotDetail, type DetailDeps } from '@/ui/useScreenshotDetail';

const strings = getStrings(deviceLocale());
const deps: DetailDeps = {
  getRepository,
  openUrl: (url) => Linking.openURL(url),
  reprocess: async (id) => (await getLibraryStore()).getState().reprocess({ ids: [id] }),
  remove: async (id) => (await getLibraryStore()).getState().remove(id),
  subscribe: (listener) => {
    let unsubscribe: (() => void) | null = null;
    let active = true;
    void getLibraryStore().then((store) => {
      if (active) unsubscribe = store.subscribe(listener);
    });
    return () => {
      active = false;
      unsubscribe?.();
    };
  },
};

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

export default function ScreenshotDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const detail = useScreenshotDetail(String(id), deps, strings);

  return (
    <ScreenshotDetailScreen
      actions={{
        press: (entity) => void detail.press(entity),
        back: goBack,
        reprocess: () => void detail.reprocess(),
        remove: () =>
          void detail.remove().then((removed) => {
            if (removed) goBack();
          }),
      }}
      entities={detail.entities}
      error={detail.error}
      loading={detail.loading}
      record={detail.record}
      strings={strings}
    />
  );
}
