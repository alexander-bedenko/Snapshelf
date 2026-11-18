/**
 * @jest-environment node
 */
import { entityTarget, formatLocalIso, localIsoToEpoch } from '@/core/details/entityTarget';

describe('entityTarget', () => {
  it('opens links, mail and phone apps', () => {
    expect(entityTarget({ type: 'link', value: 'x.com', normalized: 'https://x.com' })).toEqual({
      kind: 'url',
      url: 'https://x.com',
    });
    expect(entityTarget({ type: 'email', value: 'A@b.co', normalized: 'a@b.co' })).toEqual({
      kind: 'url',
      url: 'mailto:a@b.co',
    });
    expect(
      entityTarget({ type: 'phone', value: '+48 501 234 567', normalized: '+48501234567' }),
    ).toEqual({ kind: 'url', url: 'tel:+48501234567' });
  });

  it('opens the calendar at the local date and time', () => {
    const target = entityTarget({
      type: 'date',
      value: 'завтра в 10:00',
      normalized: '2026-11-19T10:00',
      extra: { hasTime: true },
    });
    expect(target).toEqual({
      kind: 'url',
      url: `content://com.android.calendar/time/${Date.parse('2026-11-19T09:00:00Z')}`,
    });
  });

  it('toggles tasks in the app', () => {
    expect(
      entityTarget({
        type: 'task',
        value: '[ ] milk',
        normalized: 'milk',
        extra: { rule: 'checkbox', done: false },
      }),
    ).toEqual({ kind: 'toggle-task' });
  });
});

describe('local ISO dates', () => {
  it('parses as local time, date-only at local midnight', () => {
    expect(localIsoToEpoch('2026-11-19')).toBe(Date.parse('2026-11-18T23:00:00Z'));
    expect(localIsoToEpoch('2026-07-03T08:00')).toBe(Date.parse('2026-07-03T06:00:00Z'));
    expect(() => localIsoToEpoch('19.11.2026')).toThrow();
  });

  it('formats for display', () => {
    expect(formatLocalIso('2026-03-12T15:30')).toBe('2026-03-12 15:30');
    expect(formatLocalIso('2026-03-12')).toBe('2026-03-12');
  });
});
