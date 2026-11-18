import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { Repository, StoredEntity } from '@/core/repository';
import type { ScreenshotRecord } from '@/core/types';
import { ScreenshotDetailScreen } from '@/ui/ScreenshotDetailScreen';
import { getStrings, type Strings } from '@/ui/strings';
import { useScreenshotDetail, type DetailDeps } from '@/ui/useScreenshotDetail';

const en = getStrings('en');
const ru = getStrings('ru');

const RECORD: ScreenshotRecord = {
  id: 's1',
  uri: 'content://media/external/images/media/1',
  takenAt: 1,
  width: 1080,
  height: 2400,
  status: 'done',
  ocrText: 'Купить молоко завтра',
  topic: null,
  processedAt: 1,
  error: null,
  attempts: 1,
  nextRetryAt: null,
};

function entities(): StoredEntity[] {
  return [
    {
      id: 1,
      screenshotId: 's1',
      type: 'link',
      value: 'example.com',
      normalized: 'https://example.com',
    },
    { id: 2, screenshotId: 's1', type: 'email', value: 'A@b.co', normalized: 'a@b.co' },
    {
      id: 3,
      screenshotId: 's1',
      type: 'phone',
      value: '+48 501 234 567',
      normalized: '+48501234567',
    },
    {
      id: 4,
      screenshotId: 's1',
      type: 'date',
      value: 'завтра в 10:00',
      normalized: '2026-11-19T10:00',
      extra: { hasTime: true },
    },
    {
      id: 5,
      screenshotId: 's1',
      type: 'task',
      value: 'Купить молоко',
      normalized: 'Купить молоко',
      extra: { rule: 'verb', done: false },
    },
  ];
}

function fakeDeps(options: { record?: ScreenshotRecord | null; items?: StoredEntity[] } = {}) {
  const items = options.items ?? entities();
  const repo = {
    getById: jest.fn(async () => (options.record === undefined ? RECORD : options.record)),
    getEntities: jest.fn(async () => items.map((e) => ({ ...e }))),
    setTaskDone: jest.fn(async (id: number, done: boolean) => {
      const task = items.find((e) => e.id === id);
      if (task?.type !== 'task') return false;
      task.extra = { ...task.extra, done };
      return true;
    }),
  };
  const deps: DetailDeps = {
    getRepository: async () => repo as unknown as Repository,
    openUrl: jest.fn(async () => undefined),
  };
  return { deps, repo };
}

function Detail({ deps, strings = en }: { deps: DetailDeps; strings?: Strings }) {
  const detail = useScreenshotDetail('s1', deps, strings);
  return (
    <ScreenshotDetailScreen
      actions={{ press: (e) => void detail.press(e), back: jest.fn() }}
      entities={detail.entities}
      error={detail.error}
      loading={detail.loading}
      record={detail.record}
      strings={strings}
    />
  );
}

describe('screenshot detail ("found items")', () => {
  it('shows found items with their kind, and the recognized text', async () => {
    const { deps } = fakeDeps();
    await render(<Detail deps={deps} />);

    await waitFor(() => expect(screen.getByTestId('found-items')).toBeTruthy());
    expect(screen.getByText('example.com')).toBeTruthy();
    expect(screen.getByText('2026-11-19 10:00 · завтра в 10:00')).toBeTruthy();
    expect(screen.getByText(en.entityLabel.phone)).toBeTruthy();
    expect(screen.getByTestId('task-state-5').props.children).toBe('☐');
    expect(screen.getByTestId('ocr-text').props.children).toBe(RECORD.ocrText);
  });

  it.each([
    [1, 'https://example.com'],
    [2, 'mailto:a@b.co'],
    [3, 'tel:+48501234567'],
  ])('tapping entity %i opens %s', async (id, url) => {
    const { deps } = fakeDeps();
    await render(<Detail deps={deps} />);
    await waitFor(() => expect(screen.getByTestId(`entity-${id}`)).toBeTruthy());

    await fireEvent.press(screen.getByTestId(`entity-${id}`));

    await waitFor(() => expect(deps.openUrl).toHaveBeenCalledWith(url));
  });

  it('tapping a date opens the calendar at that time', async () => {
    const { deps } = fakeDeps();
    await render(<Detail deps={deps} />);
    await waitFor(() => expect(screen.getByTestId('entity-4')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('entity-4'));

    await waitFor(() =>
      expect(deps.openUrl).toHaveBeenCalledWith(
        `content://com.android.calendar/time/${new Date(2026, 10, 19, 10, 0).getTime()}`,
      ),
    );
  });

  it('tapping a task checks it off and back on', async () => {
    const { deps, repo } = fakeDeps();
    await render(<Detail deps={deps} />);
    await waitFor(() => expect(screen.getByTestId('entity-5')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('entity-5'));
    await waitFor(() => expect(screen.getByTestId('task-state-5').props.children).toBe('☑'));
    expect(repo.setTaskDone).toHaveBeenLastCalledWith(5, true);

    await fireEvent.press(screen.getByTestId('entity-5'));
    await waitFor(() => expect(screen.getByTestId('task-state-5').props.children).toBe('☐'));
    expect(repo.setTaskDone).toHaveBeenLastCalledWith(5, false);
    expect(deps.openUrl).not.toHaveBeenCalled();
  });

  it('says so when no app can open the item', async () => {
    const { deps } = fakeDeps();
    (deps.openUrl as jest.Mock).mockRejectedValueOnce(new Error('No Activity found'));
    await render(<Detail deps={deps} />);
    await waitFor(() => expect(screen.getByTestId('entity-3')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('entity-3'));

    await waitFor(() => expect(screen.getByText(en.openFailed('+48 501 234 567'))).toBeTruthy());
  });

  it('shows "nothing found" and a missing screenshot', async () => {
    const empty = fakeDeps({ items: [] });
    await render(<Detail deps={empty.deps} />);
    await waitFor(() => expect(screen.getByTestId('nothing-found')).toBeTruthy());

    const missing = fakeDeps({ record: null, items: [] });
    await render(<Detail deps={missing.deps} />);
    await waitFor(() => expect(screen.getByTestId('detail-missing')).toBeTruthy());
  });

  it('is available in Russian', async () => {
    const { deps } = fakeDeps();
    await render(<Detail deps={deps} strings={ru} />);
    await waitFor(() => expect(screen.getByText(ru.foundTitle)).toBeTruthy());
    expect(screen.getByText(ru.entityLabel.task)).toBeTruthy();
  });
});
