import { PermissionDeniedError, type ScreenshotRef } from '@/core/types';
import {
  AndroidScreenshotSource,
  type NativeScreenshotMedia,
  type PermissionsApi,
} from '@/platform/media/android/AndroidScreenshotSource';
import { ref } from '../helpers/fixtures';

function setup(apiLevel: number, overrides: Partial<PermissionsApi> = {}) {
  let changed: (() => void) | undefined;
  const remove = jest.fn();
  const native: jest.Mocked<NativeScreenshotMedia> = {
    listScreenshots: jest.fn(async (_sinceMs: number) => [] as ScreenshotRef[]),
    addListener: jest.fn((_event, listener) => {
      changed = listener;
      return { remove };
    }),
  };
  const permissions: jest.Mocked<PermissionsApi> = {
    check: jest.fn(async () => false),
    request: jest.fn(async () => 'granted' as const),
    ...overrides,
  } as jest.Mocked<PermissionsApi>;
  const source = new AndroidScreenshotSource({ native, permissions, apiLevel, debounceMs: 10 });
  return { source, native, permissions, remove, emitChange: () => changed?.() };
}

describe('AndroidScreenshotSource permissions', () => {
  it('uses READ_MEDIA_IMAGES on Android 13+', async () => {
    const { source, permissions } = setup(33);
    await source.getPermission();
    await source.requestPermission();
    expect(permissions.check).toHaveBeenCalledWith('android.permission.READ_MEDIA_IMAGES');
    expect(permissions.request).toHaveBeenCalledWith('android.permission.READ_MEDIA_IMAGES');
  });

  it('uses READ_EXTERNAL_STORAGE before Android 13', async () => {
    const { source, permissions } = setup(32);
    await source.getPermission();
    await source.requestPermission();
    expect(permissions.check).toHaveBeenCalledWith('android.permission.READ_EXTERNAL_STORAGE');
    expect(permissions.request).toHaveBeenCalledWith('android.permission.READ_EXTERNAL_STORAGE');
  });

  it('reports granted or undetermined without prompting', async () => {
    const granted = setup(34, { check: jest.fn(async () => true) });
    expect(await granted.source.getPermission()).toBe('granted');
    const notYet = setup(34);
    expect(await notYet.source.getPermission()).toBe('undetermined');
    expect(notYet.permissions.request).not.toHaveBeenCalled();
  });

  it.each([
    ['granted', 'granted'],
    ['denied', 'denied'],
    ['never_ask_again', 'blocked'],
  ] as const)('maps the system answer %s to %s', async (answer, expected) => {
    const { source } = setup(34, { request: jest.fn(async () => answer) });
    expect(await source.requestPermission()).toBe(expected);
  });
});

describe('AndroidScreenshotSource listing', () => {
  it('passes `since` through and returns the native list', async () => {
    const { source, native } = setup(34);
    native.listScreenshots.mockResolvedValue([ref(1)]);

    expect(await source.listScreenshots(123)).toEqual([ref(1)]);
    expect(native.listScreenshots).toHaveBeenCalledWith(123);
  });

  it('maps the native permission error to PermissionDeniedError and rethrows others', async () => {
    const { source, native } = setup(34);
    native.listScreenshots.mockRejectedValueOnce(
      Object.assign(new Error('nope'), { code: 'ERR_PERMISSION_DENIED' }),
    );
    await expect(source.listScreenshots()).rejects.toBeInstanceOf(PermissionDeniedError);

    native.listScreenshots.mockRejectedValueOnce(new Error('cursor failed'));
    await expect(source.listScreenshots()).rejects.toThrow('cursor failed');
  });
});

describe('AndroidScreenshotSource.onNew', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('debounces bursts of media changes into one scan and reports new screenshots', async () => {
    const { source, native, emitChange } = setup(34);
    const seen = jest.fn();
    native.listScreenshots.mockResolvedValue([ref(1, { takenAt: Date.now() })]);
    source.onNew(seen);

    emitChange();
    emitChange();
    emitChange();
    await jest.advanceTimersByTimeAsync(50);

    expect(native.listScreenshots).toHaveBeenCalledTimes(1);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen.mock.calls[0][0]).toHaveLength(1);
  });

  it('only asks for screenshots newer than the last one it reported', async () => {
    const { source, native, emitChange } = setup(34);
    const takenAt = Date.now() + 5000;
    native.listScreenshots.mockResolvedValue([ref(1, { takenAt })]);
    source.onNew(jest.fn());

    emitChange();
    await jest.advanceTimersByTimeAsync(50);
    emitChange();
    await jest.advanceTimersByTimeAsync(50);

    expect(native.listScreenshots.mock.calls[1][0]).toBe(takenAt);
  });

  it('stays silent when a change brings no screenshots or permission was lost', async () => {
    const { source, native, emitChange } = setup(34);
    const seen = jest.fn();
    source.onNew(seen);

    emitChange();
    await jest.advanceTimersByTimeAsync(50);
    native.listScreenshots.mockRejectedValue(
      Object.assign(new Error('x'), { code: 'ERR_PERMISSION_DENIED' }),
    );
    emitChange();
    await jest.advanceTimersByTimeAsync(50);

    expect(seen).not.toHaveBeenCalled();
  });

  it('unsubscribing removes the native listener and cancels a pending scan', async () => {
    const { source, native, emitChange, remove } = setup(34);
    const seen = jest.fn();
    const unsubscribe = source.onNew(seen);

    emitChange();
    unsubscribe();
    await jest.advanceTimersByTimeAsync(50);

    expect(remove).toHaveBeenCalledTimes(1);
    expect(native.listScreenshots).not.toHaveBeenCalled();
    expect(seen).not.toHaveBeenCalled();
  });
});
