import { describe, expect, it } from 'vitest';
import { toDateString, toHourKey, toMinuteKey, hourKeyToEpochMs, wallClockToEpochMs } from './time.js';

describe('timezone-aware formatting', () => {
  it('formats day/hour/minute keys in a given IANA timezone', () => {
    const instant = new Date('2026-08-27T01:11:47.000Z'); // = 09:11:47 in Asia/Shanghai
    expect(toDateString(instant, 'Asia/Shanghai')).toBe('2026-08-27');
    expect(toHourKey(instant, 'Asia/Shanghai')).toBe('2026-08-27T09:00:00');
    expect(toMinuteKey(instant, 'Asia/Shanghai')).toBe('2026-08-27T09:11');
  });

  it('round-trips hour keys back to epoch in the same timezone', () => {
    expect(hourKeyToEpochMs('2026-08-27T09:00:00', 'Asia/Shanghai'))
      .toBe(Date.UTC(2026, 7, 27, 1, 0, 0));
    expect(hourKeyToEpochMs('2026-08-27T00:00:00', 'UTC'))
      .toBe(Date.UTC(2026, 7, 27, 0, 0, 0));
  });

  it('resolves wall-clock to UTC across a DST spring-forward boundary', () => {
    // 2026-03-08 03:30 in America/New_York exists as EDT (UTC-4) => 07:30 UTC
    expect(wallClockToEpochMs(2026, 2, 8, 3, 30, 0, 'America/New_York'))
      .toBe(Date.UTC(2026, 2, 8, 7, 30, 0));
  });

  it('keeps local-time behavior when tz is local', () => {
    const d = new Date(2026, 7, 27, 9, 11, 47);
    expect(toDateString(d)).toBe('2026-08-27');
    expect(toHourKey(d)).toBe('2026-08-27T09:00:00');
    expect(toMinuteKey(d)).toBe('2026-08-27T09:11');
    expect(hourKeyToEpochMs('2026-08-27T09:00:00')).toBe(new Date(2026, 7, 27, 9).getTime());
  });
});
