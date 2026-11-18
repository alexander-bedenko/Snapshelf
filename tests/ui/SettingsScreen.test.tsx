import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { SettingsScreen, type SettingsScreenProps } from '@/ui/SettingsScreen';
import { getStrings } from '@/ui/strings';

const en = getStrings('en');
const ru = getStrings('ru');

async function setup(state: Partial<SettingsScreenProps['state']> = {}, strings = en) {
  const actions = {
    back: jest.fn(),
    retryFailed: jest.fn(async () => 2),
    reprocessAll: jest.fn(async () => 7),
    restoreRemoved: jest.fn(async () => 3),
  };
  await render(
    <SettingsScreen
      actions={actions}
      state={{
        initialized: true,
        counts: { pending: 1, processing: 0, done: 5, failed: 2 },
        removedCount: 3,
        processing: false,
        error: null,
        ...state,
      }}
      strings={strings}
    />,
  );
  return actions;
}

describe('SettingsScreen', () => {
  it('shows library numbers and removed screenshots', async () => {
    await setup();
    expect(screen.getByText('8 screenshots: 5 done, 2 failed, 1 waiting')).toBeTruthy();
    expect(screen.getByText('3 screenshots removed from Snapshelf')).toBeTruthy();
    expect(screen.getByText(en.privacyNote)).toBeTruthy();
  });

  it.each([
    ['retry-failed', 'retryFailed', '2 screenshots queued'],
    ['reprocess-all', 'reprocessAll', '7 screenshots queued'],
    ['restore-removed', 'restoreRemoved', '3 screenshots queued'],
  ] as const)('%s runs %s and reports the result', async (testID, action, notice) => {
    const actions = await setup();

    await fireEvent.press(screen.getByTestId(testID));

    expect(actions[action]).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByText(notice)).toBeTruthy());
  });

  it('disables actions that have nothing to do', async () => {
    const actions = await setup({
      counts: { pending: 0, processing: 0, done: 0, failed: 0 },
      removedCount: 0,
    });

    for (const id of ['retry-failed', 'reprocess-all', 'restore-removed']) {
      await fireEvent.press(screen.getByTestId(id));
    }

    expect(actions.retryFailed).not.toHaveBeenCalled();
    expect(actions.reprocessAll).not.toHaveBeenCalled();
    expect(actions.restoreRemoved).not.toHaveBeenCalled();
    expect(screen.queryByTestId('removed-stats')).toBeNull();
  });

  it('shows loading, processing and error states', async () => {
    await setup({ initialized: false });
    expect(screen.getByTestId('settings-loading')).toBeTruthy();

    await setup({ processing: true, error: 'disk full' });
    expect(screen.getByTestId('settings-processing')).toBeTruthy();
    expect(screen.getByText(en.error('disk full'))).toBeTruthy();
  });

  it('goes back', async () => {
    const actions = await setup();
    await fireEvent.press(screen.getByTestId('back'));
    expect(actions.back).toHaveBeenCalledTimes(1);
  });

  it('is available in Russian with correct plurals', async () => {
    await setup(
      { counts: { pending: 0, processing: 0, done: 21, failed: 0 }, removedCount: 1 },
      ru,
    );
    expect(screen.getByText('21 скриншот: готово 21, ошибок 0, в очереди 0')).toBeTruthy();
    expect(screen.getByText('Убран из Snapshelf: 1 скриншот')).toBeTruthy();
  });
});
