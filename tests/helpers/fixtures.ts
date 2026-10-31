import type { ScreenshotRef } from '@/core/types';

export function ref(n: number, overrides: Partial<ScreenshotRef> = {}): ScreenshotRef {
  return {
    id: `s${n}`,
    uri: `content://media/external/images/media/${n}`,
    takenAt: 1_000_000 + n * 1000,
    width: 1080,
    height: 2400,
    ...overrides,
  };
}

export function refs(count: number): ScreenshotRef[] {
  return Array.from({ length: count }, (_, i) => ref(i + 1));
}

/** A promise you resolve or reject from the outside. */
export function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export async function waitFor(condition: () => boolean | Promise<boolean>, timeoutMs = 2000) {
  const started = Date.now();
  while (!(await condition())) {
    if (Date.now() - started > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 5));
  }
}
