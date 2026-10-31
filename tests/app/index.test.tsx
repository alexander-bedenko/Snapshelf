import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createStore } from 'zustand/vanilla';

import type { LibraryState, LibraryStore } from '@/core/library/libraryStore';

import Index from '../../src/app/index';

const mockState: { store: LibraryStore | null } = { store: null };

jest.mock('@/ui/services', () => ({
  getLibraryStore: () => Promise.resolve(mockState.store),
  openAppSettings: jest.fn(),
}));

function stubStore(initial: Partial<LibraryState> = {}): LibraryStore {
  return createStore<LibraryState>((set) => ({
    permission: 'unknown',
    initialized: false,
    syncing: false,
    processing: false,
    deviceEmpty: false,
    counts: { pending: 0, processing: 0, done: 0, failed: 0 },
    items: [],
    error: null,
    init: jest.fn(async () => set({ initialized: true, permission: 'undetermined' })),
    requestPermission: jest.fn(async () => set({ permission: 'denied' })),
    refresh: jest.fn(async () => undefined),
    onForeground: jest.fn(async () => undefined),
    dispose: jest.fn(),
    ...initial,
  }));
}

describe('Index screen', () => {
  it('initializes the library once, explains the permission and requests it only on tap', async () => {
    mockState.store = stubStore();

    await render(<Index />);

    await waitFor(() => expect(screen.getByTestId('permission-explain')).toBeTruthy());
    expect(mockState.store.getState().init).toHaveBeenCalledTimes(1);
    expect(mockState.store.getState().requestPermission).not.toHaveBeenCalled();

    // Not awaited on purpose: awaiting a press that synchronously updates an external store never
    // settles under RNTL 14 + useSyncExternalStore; the visible result is awaited with waitFor instead.
    void fireEvent.press(screen.getByTestId('allow-access'));

    await waitFor(() => expect(screen.getByTestId('permission-denied')).toBeTruthy());
    expect(mockState.store.getState().requestPermission).toHaveBeenCalledTimes(1);
  });

  it('does not initialize an already initialized store again', async () => {
    mockState.store = stubStore({ initialized: true, permission: 'granted', deviceEmpty: true });

    await render(<Index />);

    await waitFor(() => expect(screen.getByTestId('empty-state')).toBeTruthy());
    expect(mockState.store.getState().init).not.toHaveBeenCalled();
  });
});
