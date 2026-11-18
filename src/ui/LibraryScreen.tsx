import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { LibraryState } from '@/core/library/libraryStore';
import type { ScreenshotRecord } from '@/core/types';

import type { Strings } from './strings';

export type LibraryScreenProps = {
  state: Pick<
    LibraryState,
    | 'permission'
    | 'initialized'
    | 'syncing'
    | 'processing'
    | 'deviceEmpty'
    | 'counts'
    | 'items'
    | 'error'
    | 'query'
    | 'results'
    | 'searching'
  >;
  actions: {
    requestPermission(): void;
    refresh(): void;
    openSettings(): void;
    setQuery(query: string): void;
    openScreenshot(id: string): void;
    openSettingsScreen(): void;
  };
  strings: Strings;
};

function Button({ label, onPress, testID }: { label: string; onPress(): void; testID: string }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.button} testID={testID}>
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

function PermissionCard({ state, actions, strings }: LibraryScreenProps) {
  if (state.permission === 'granted') return null;
  if (state.permission === 'denied') {
    return (
      <View style={styles.card} testID="permission-denied">
        <Text style={styles.cardTitle}>{strings.deniedTitle}</Text>
        <Text style={styles.body}>{strings.deniedBody}</Text>
        <Button
          label={strings.tryAgain}
          onPress={actions.requestPermission}
          testID="retry-permission"
        />
      </View>
    );
  }
  if (state.permission === 'blocked') {
    return (
      <View style={styles.card} testID="permission-blocked">
        <Text style={styles.cardTitle}>{strings.deniedTitle}</Text>
        <Text style={styles.body}>{strings.blockedBody}</Text>
        <Button
          label={strings.openSettings}
          onPress={actions.openSettings}
          testID="open-settings"
        />
      </View>
    );
  }
  return (
    <View style={styles.card} testID="permission-explain">
      <Text style={styles.cardTitle}>{strings.permissionTitle}</Text>
      <Text style={styles.body}>{strings.permissionBody}</Text>
      <Button label={strings.allow} onPress={actions.requestPermission} testID="allow-access" />
    </View>
  );
}

function Row({
  item,
  strings,
  onPress,
}: {
  item: ScreenshotRecord;
  strings: Strings;
  onPress(): void;
}) {
  let snippet = '';
  if (item.status === 'done') snippet = item.ocrText ? item.ocrText.slice(0, 140) : strings.noText;
  if (item.status === 'failed') snippet = item.error ?? '';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={styles.row}
      testID={`row-${item.id}`}
    >
      <Image source={{ uri: item.uri }} style={styles.thumb} />
      <View style={styles.rowText}>
        <Text style={styles.status}>{strings.status[item.status]}</Text>
        {snippet ? (
          <Text numberOfLines={3} style={styles.body}>
            {snippet}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export function LibraryScreen(props: LibraryScreenProps) {
  const { state, actions, strings } = props;

  if (!state.initialized) {
    return (
      <View style={styles.center} testID="loading">
        <ActivityIndicator />
        <Text style={styles.body}>{strings.loading}</Text>
      </View>
    );
  }

  const total =
    state.counts.pending + state.counts.processing + state.counts.done + state.counts.failed;
  const results = state.results;
  const searchActive = results !== null;
  const showEmpty =
    !searchActive &&
    state.permission === 'granted' &&
    !state.syncing &&
    state.deviceEmpty &&
    state.items.length === 0;
  const canSearch = total > 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{strings.title}</Text>
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={actions.openSettingsScreen}
          testID="settings-link"
        >
          <Text style={styles.link}>{strings.settings}</Text>
        </Pressable>
      </View>
      {total > 0 ? (
        <Text style={styles.body} testID="progress">
          {strings.progress(state.counts.done, total)}
        </Text>
      ) : null}
      {state.error ? <Text style={styles.error}>{strings.error(state.error)}</Text> : null}
      <PermissionCard {...props} />
      {canSearch ? (
        <View style={styles.searchRow}>
          <TextInput
            accessibilityLabel={strings.searchPlaceholder}
            autoCorrect={false}
            clearButtonMode="while-editing"
            onChangeText={actions.setQuery}
            placeholder={strings.searchPlaceholder}
            returnKeyType="search"
            style={styles.searchInput}
            testID="search-input"
            value={state.query}
          />
          {state.query ? (
            <Pressable
              accessibilityLabel={strings.searchClear}
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => actions.setQuery('')}
              testID="search-clear"
            >
              <Text style={styles.clear}>✕</Text>
            </Pressable>
          ) : null}
          {state.searching ? <ActivityIndicator testID="search-busy" /> : null}
        </View>
      ) : null}
      {results && results.length > 0 ? (
        <Text style={styles.body} testID="search-count">
          {strings.resultsCount(results.length)}
        </Text>
      ) : null}
      {results && results.length === 0 && !state.searching ? (
        <Text style={styles.body} testID="search-empty">
          {strings.noResults(state.query.trim())}
        </Text>
      ) : null}
      {showEmpty ? (
        <View style={styles.card} testID="empty-state">
          <Text style={styles.cardTitle}>{strings.emptyTitle}</Text>
          <Text style={styles.body}>{strings.emptyBody}</Text>
          <Button label={strings.rescan} onPress={actions.refresh} testID="rescan" />
        </View>
      ) : null}
      <FlatList
        data={results ?? state.items}
        keyboardShouldPersistTaps="handled"
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Row item={item} onPress={() => actions.openScreenshot(item.id)} strings={strings} />
        )}
        initialNumToRender={10}
        windowSize={7}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 56, paddingHorizontal: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 4 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  link: { fontSize: 16, color: '#208AEF' },
  body: { fontSize: 15, color: '#444' },
  error: { color: '#b00020', marginVertical: 8 },
  card: { backgroundColor: '#f2f4f8', borderRadius: 12, padding: 16, marginVertical: 12, gap: 8 },
  cardTitle: { fontSize: 18, fontWeight: '600' },
  button: {
    backgroundColor: '#208AEF',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 12, paddingVertical: 8 },
  rowText: { flex: 1, gap: 2 },
  thumb: { width: 56, height: 100, borderRadius: 6, backgroundColor: '#ddd' },
  status: { fontSize: 13, fontWeight: '600', color: '#208AEF' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 8 },
  searchInput: {
    flex: 1,
    backgroundColor: '#f2f4f8',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  clear: { fontSize: 18, color: '#666', paddingHorizontal: 4 },
});
