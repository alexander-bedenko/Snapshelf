import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { LibraryState } from '@/core/library/libraryStore';

import type { Strings } from './strings';

export type SettingsScreenProps = {
  state: Pick<LibraryState, 'initialized' | 'counts' | 'removedCount' | 'processing' | 'error'>;
  actions: {
    back(): void;
    retryFailed(): Promise<number>;
    reprocessAll(): Promise<number>;
    restoreRemoved(): Promise<number>;
  };
  strings: Strings;
};

function Action({
  label,
  onPress,
  testID,
  disabled,
}: {
  label: string;
  onPress(): void;
  testID: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={styles.action}
      testID={testID}
    >
      <Text style={[styles.actionText, disabled && styles.disabled]}>{label}</Text>
    </Pressable>
  );
}

export function SettingsScreen({ state, actions, strings }: SettingsScreenProps) {
  const [notice, setNotice] = useState<string | null>(null);
  const { counts } = state;
  const total = counts.pending + counts.processing + counts.done + counts.failed;

  const run = (action: () => Promise<number>) => () => {
    setNotice(null);
    void action().then((count) => setNotice(strings.queued(count)));
  };

  return (
    <ScrollView contentContainerStyle={styles.container} testID="settings">
      <Pressable accessibilityRole="button" onPress={actions.back} testID="back">
        <Text style={styles.back}>‹ {strings.back}</Text>
      </Pressable>
      <Text style={styles.title}>{strings.settingsTitle}</Text>
      {!state.initialized ? (
        <ActivityIndicator testID="settings-loading" />
      ) : (
        <>
          <Text style={styles.body} testID="library-stats">
            {strings.libraryStats({
              total,
              done: counts.done,
              failed: counts.failed,
              queued: counts.pending + counts.processing,
            })}
          </Text>
          {state.removedCount > 0 ? (
            <Text style={styles.body} testID="removed-stats">
              {strings.removedStats(state.removedCount)}
            </Text>
          ) : null}
          {state.processing ? (
            <View style={styles.row} testID="settings-processing">
              <ActivityIndicator />
              <Text style={styles.body}>{strings.status.processing}</Text>
            </View>
          ) : null}
          {state.error ? <Text style={styles.error}>{strings.error(state.error)}</Text> : null}
          {notice ? (
            <Text style={styles.notice} testID="settings-notice">
              {notice}
            </Text>
          ) : null}

          <View style={styles.section}>
            <Action
              disabled={counts.failed === 0}
              label={strings.retryFailed(counts.failed)}
              onPress={run(actions.retryFailed)}
              testID="retry-failed"
            />
            <Action
              disabled={counts.done + counts.failed === 0}
              label={strings.reprocessAll}
              onPress={run(actions.reprocessAll)}
              testID="reprocess-all"
            />
            <Text style={styles.hint}>{strings.reprocessAllBody}</Text>
            <Action
              disabled={state.removedCount === 0}
              label={strings.restoreRemoved(state.removedCount)}
              onPress={run(actions.restoreRemoved)}
              testID="restore-removed"
            />
          </View>
          <Text style={styles.hint}>{strings.privacyNote}</Text>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingTop: 48, paddingHorizontal: 16, paddingBottom: 32, gap: 8 },
  back: { fontSize: 17, color: '#208AEF', paddingVertical: 8 },
  title: { fontSize: 28, fontWeight: '700' },
  body: { fontSize: 15, color: '#444' },
  hint: { fontSize: 13, color: '#666' },
  error: { color: '#b00020' },
  notice: { color: '#1b7f3b' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  section: { marginVertical: 16, gap: 4 },
  action: { paddingVertical: 12 },
  actionText: { fontSize: 16, color: '#208AEF' },
  disabled: { color: '#aaa' },
});
