import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Text, View } from 'react-native';
import { useStore } from 'zustand';

import type { LibraryStore } from '@/core/library/libraryStore';
import { LibraryScreen } from '@/ui/LibraryScreen';
import { getLibraryStore, openAppSettings } from '@/ui/services';
import { deviceLocale, getStrings } from '@/ui/strings';

const strings = getStrings(deviceLocale());

function Connected({ store }: { store: LibraryStore }) {
  const state = useStore(store);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void store.getState().onForeground();
    });
    return () => subscription.remove();
  }, [store]);

  return (
    <LibraryScreen
      state={state}
      actions={{
        requestPermission: () => void state.requestPermission(),
        refresh: () => void state.refresh(),
        openSettings: openAppSettings,
        setQuery: state.setQuery,
      }}
      strings={strings}
    />
  );
}

export default function Index() {
  const [store, setStore] = useState<LibraryStore | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getLibraryStore()
      .then((s) => {
        if (cancelled) return;
        setStore(s);
        if (!s.getState().initialized) void s.getState().init();
      })
      .catch((e) => setBootError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, []);

  if (bootError) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
        <Text>{strings.error(bootError)}</Text>
      </View>
    );
  }
  if (!store) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }
  return <Connected store={store} />;
}
