import { fireEvent, render, screen } from '@testing-library/react-native';

import type { LibraryScreenProps } from '@/ui/LibraryScreen';
import { LibraryScreen } from '@/ui/LibraryScreen';
import { getStrings } from '@/ui/strings';
import type { ScreenshotRecord } from '@/core/types';

const en = getStrings('en');
const ru = getStrings('ru-RU');

function record(n: number, overrides: Partial<ScreenshotRecord> = {}): ScreenshotRecord {
  return {
    id: `s${n}`,
    uri: `content://media/external/images/media/${n}`,
    takenAt: n,
    width: 1080,
    height: 2400,
    status: 'done',
    ocrText: `text ${n}`,
    topic: null,
    processedAt: 1,
    error: null,
    attempts: 1,
    nextRetryAt: null,
    ...overrides,
  };
}

async function setup(state: Partial<LibraryScreenProps['state']> = {}, strings = en) {
  const actions = { requestPermission: jest.fn(), refresh: jest.fn(), openSettings: jest.fn() };
  const props: LibraryScreenProps = {
    state: {
      permission: 'granted',
      initialized: true,
      syncing: false,
      processing: false,
      deviceEmpty: false,
      counts: { pending: 0, processing: 0, done: 0, failed: 0 },
      items: [],
      error: null,
      ...state,
    },
    actions,
    strings,
  };
  await render(<LibraryScreen {...props} />);
  return { actions };
}

describe('LibraryScreen', () => {
  it('shows a loading state until initialized', async () => {
    await setup({ initialized: false });
    expect(screen.getByTestId('loading')).toBeTruthy();
  });

  it('explains why access is needed and only asks when the user taps the button', async () => {
    const { actions } = await setup({ permission: 'undetermined' });

    expect(screen.getByTestId('permission-explain')).toBeTruthy();
    expect(screen.getByText(en.permissionBody)).toBeTruthy();
    expect(actions.requestPermission).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('allow-access'));
    expect(actions.requestPermission).toHaveBeenCalledTimes(1);
  });

  it('shows the denied state with a retry button', async () => {
    const { actions } = await setup({ permission: 'denied' });

    expect(screen.getByTestId('permission-denied')).toBeTruthy();
    expect(screen.queryByTestId('permission-explain')).toBeNull();
    await fireEvent.press(screen.getByTestId('retry-permission'));
    expect(actions.requestPermission).toHaveBeenCalledTimes(1);
  });

  it('sends the user to system settings when the permission is blocked', async () => {
    const { actions } = await setup({ permission: 'blocked' });

    expect(screen.getByTestId('permission-blocked')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('open-settings'));
    expect(actions.openSettings).toHaveBeenCalledTimes(1);
    expect(actions.requestPermission).not.toHaveBeenCalled();
  });

  it('shows the empty state when there are no screenshots, with a rescan action', async () => {
    const { actions } = await setup({ deviceEmpty: true });

    expect(screen.getByTestId('empty-state')).toBeTruthy();
    expect(screen.getByText(en.emptyTitle)).toBeTruthy();
    expect(screen.queryByTestId('permission-explain')).toBeNull();
    await fireEvent.press(screen.getByTestId('rescan'));
    expect(actions.refresh).toHaveBeenCalledTimes(1);
  });

  it('does not flash the empty state while a sync is running', async () => {
    await setup({ deviceEmpty: true, syncing: true });
    expect(screen.queryByTestId('empty-state')).toBeNull();
  });

  it('lists screenshots with status, text, errors and progress', async () => {
    await setup({
      counts: { pending: 1, processing: 0, done: 2, failed: 1 },
      items: [
        record(1),
        record(2, { ocrText: '' }),
        record(3, { status: 'failed', ocrText: null, error: 'Cannot read image' }),
        record(4, { status: 'pending', ocrText: null }),
      ],
    });

    expect(screen.getByTestId('progress')).toHaveTextContent('Processed 2 of 4');
    expect(screen.getByText('text 1')).toBeTruthy();
    expect(screen.getByText(en.noText)).toBeTruthy();
    expect(screen.getByText('Cannot read image')).toBeTruthy();
    expect(screen.getByText(en.status.pending)).toBeTruthy();
  });

  it('keeps showing stored screenshots next to the permission card', async () => {
    await setup({
      permission: 'denied',
      items: [record(1)],
      counts: { pending: 0, processing: 0, done: 1, failed: 0 },
    });

    expect(screen.getByTestId('permission-denied')).toBeTruthy();
    expect(screen.getByText('text 1')).toBeTruthy();
  });

  it('renders an error banner', async () => {
    await setup({ error: 'boom' });
    expect(screen.getByText(en.error('boom'))).toBeTruthy();
  });

  it('is available in Russian', async () => {
    await setup({ permission: 'undetermined' }, ru);
    expect(screen.getByText(ru.permissionBody)).toBeTruthy();
    expect(ru.permissionBody).not.toBe(en.permissionBody);
  });
});
