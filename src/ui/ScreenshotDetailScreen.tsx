import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { formatLocalIso } from '@/core/details/entityTarget';
import type { StoredEntity } from '@/core/repository';
import type { ScreenshotRecord } from '@/core/types';

import type { Strings } from './strings';

export type ScreenshotDetailProps = {
  loading: boolean;
  record: ScreenshotRecord | null;
  entities: StoredEntity[];
  error: string | null;
  actions: {
    press(entity: StoredEntity): void;
    back(): void;
    reprocess(): void;
    remove(): void;
  };
  strings: Strings;
};

function display(entity: StoredEntity): string {
  if (entity.type === 'date') return `${formatLocalIso(entity.normalized)} · ${entity.value}`;
  if (entity.type === 'task') return entity.normalized;
  return entity.value;
}

function EntityRow({
  entity,
  onPress,
  strings,
}: {
  entity: StoredEntity;
  onPress(): void;
  strings: Strings;
}) {
  const done = entity.type === 'task' && entity.extra.done;
  return (
    <Pressable
      accessibilityRole={entity.type === 'task' ? 'checkbox' : 'link'}
      accessibilityState={entity.type === 'task' ? { checked: done } : undefined}
      onPress={onPress}
      style={styles.entity}
      testID={`entity-${entity.id}`}
    >
      <Text style={styles.entityLabel}>{strings.entityLabel[entity.type]}</Text>
      <View style={styles.entityBody}>
        {entity.type === 'task' ? (
          <Text style={styles.check} testID={`task-state-${entity.id}`}>
            {done ? '☑' : '☐'}
          </Text>
        ) : null}
        <Text style={[styles.entityValue, done && styles.done]}>{display(entity)}</Text>
      </View>
    </Pressable>
  );
}

function Action({
  label,
  onPress,
  testID,
  danger,
}: {
  label: string;
  onPress(): void;
  testID: string;
  danger?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.action} testID={testID}>
      <Text style={[styles.actionText, danger && styles.danger]}>{label}</Text>
    </Pressable>
  );
}

export function ScreenshotDetailScreen({
  loading,
  record,
  entities,
  error,
  actions,
  strings,
}: ScreenshotDetailProps) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const busy = record?.status === 'pending' || record?.status === 'processing';
  return (
    <ScrollView contentContainerStyle={styles.container} testID="screenshot-detail">
      <Pressable accessibilityRole="button" onPress={actions.back} testID="back">
        <Text style={styles.back}>‹ {strings.back}</Text>
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading ? (
        <ActivityIndicator testID="detail-loading" />
      ) : !record ? (
        <Text style={styles.body} testID="detail-missing">
          {strings.screenshotMissing}
        </Text>
      ) : (
        <>
          <Image
            resizeMode="contain"
            source={{ uri: record.uri }}
            style={[
              styles.image,
              {
                aspectRatio:
                  record.width > 0 && record.height > 0 ? record.width / record.height : 0.5,
              },
            ]}
          />
          {busy ? (
            <View style={styles.statusRow} testID="detail-busy">
              <ActivityIndicator />
              <Text style={styles.body}>{strings.status[record.status]}</Text>
            </View>
          ) : null}
          {record.status === 'failed' ? (
            <Text style={styles.error} testID="detail-failed">
              {strings.status.failed}: {record.error}
            </Text>
          ) : null}
          <Text style={styles.heading}>{strings.foundTitle}</Text>
          {entities.length === 0 ? (
            <Text style={styles.body} testID="nothing-found">
              {strings.nothingFound}
            </Text>
          ) : (
            <View testID="found-items">
              {entities.map((entity) => (
                <EntityRow
                  entity={entity}
                  key={entity.id}
                  onPress={() => actions.press(entity)}
                  strings={strings}
                />
              ))}
            </View>
          )}
          {record.ocrText ? (
            <>
              <Text style={styles.heading}>{strings.recognizedText}</Text>
              <Text selectable style={styles.body} testID="ocr-text">
                {record.ocrText}
              </Text>
            </>
          ) : null}
          <View style={styles.actions}>
            {busy ? null : (
              <Action label={strings.reprocess} onPress={actions.reprocess} testID="reprocess" />
            )}
            {confirmRemove ? (
              <View style={styles.confirm} testID="remove-confirmation">
                <Text style={styles.body}>{strings.removeConfirmBody}</Text>
                <Action
                  danger
                  label={strings.removeConfirm}
                  onPress={actions.remove}
                  testID="confirm-remove"
                />
                <Action
                  label={strings.cancel}
                  onPress={() => setConfirmRemove(false)}
                  testID="cancel-remove"
                />
              </View>
            ) : (
              <Action
                danger
                label={strings.removeFromApp}
                onPress={() => setConfirmRemove(true)}
                testID="remove"
              />
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingTop: 48, paddingHorizontal: 16, paddingBottom: 32, gap: 8 },
  back: { fontSize: 17, color: '#208AEF', paddingVertical: 8 },
  image: { width: '60%', alignSelf: 'center', borderRadius: 8, backgroundColor: '#ddd' },
  heading: { fontSize: 18, fontWeight: '600', marginTop: 16 },
  body: { fontSize: 15, color: '#444' },
  error: { color: '#b00020' },
  entity: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#ccc' },
  entityLabel: { fontSize: 12, fontWeight: '600', color: '#208AEF', textTransform: 'uppercase' },
  entityBody: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  entityValue: { fontSize: 16, color: '#222', flexShrink: 1 },
  check: { fontSize: 20 },
  done: { textDecorationLine: 'line-through', color: '#888' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actions: { marginTop: 24, gap: 4 },
  action: { paddingVertical: 12 },
  actionText: { fontSize: 16, color: '#208AEF' },
  danger: { color: '#b00020' },
  confirm: { backgroundColor: '#f2f4f8', borderRadius: 12, padding: 12, gap: 4 },
});
