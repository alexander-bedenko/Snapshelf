import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useStore } from 'zustand';

import type { LibraryStore } from '@/core/library/libraryStore';
import { getLibraryStore } from '@/ui/services';
import { SettingsScreen } from '@/ui/SettingsScreen';
import { deviceLocale, getStrings } from '@/ui/strings';

const strings = getStrings(deviceLocale());

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

function Connected({ store }: { store: LibraryStore }) {
  const state = useStore(store);
  return (
    <SettingsScreen
      actions={{
        back: goBack,
        retryFailed: () => state.reprocess('failed'),
        reprocessAll: () => state.reprocess('all'),
        restoreRemoved: () => state.restoreRemoved(),
      }}
      state={state}
      strings={strings}
    />
  );
}

export default function Settings() {
  const [store, setStore] = useState<LibraryStore | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getLibraryStore().then((s) => {
      if (!cancelled) setStore(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!store) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }
  return <Connected store={store} />;
}
