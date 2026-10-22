import { describe, expect, it } from 'vitest';
import { addDays, buildSchedule, localToUtc, weekdayOf, type SlotDef } from '@/lib/schedule';

const slot = (day: number, local_time: string): SlotDef => ({
  id: `s${day}`,
  asset_role: 'short_1',
  platform: 'threads',
  day,
  local_time,
  window_end: null,
  allow_best_time: false,
  media_type: 'video',
  notes: null,
});

describe('schedule', () => {
  it('adds days across month ends and finds the weekday', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
    expect(weekdayOf('2026-10-27')).toBe(2); // Tuesday
  });

  it('converts Eastern local time to UTC, with and without DST', () => {
    expect(localToUtc('2026-10-27', '08:00', 'America/New_York')).toBe('2026-10-27T12:00:00.000Z'); // EDT
    expect(localToUtc('2026-11-03', '08:00', 'America/New_York')).toBe('2026-11-03T13:00:00.000Z'); // EST
  });

  it('shifts a time that does not exist (spring-forward gap) to the first valid minute', () => {
    expect(localToUtc('2027-03-14', '02:30', 'America/New_York')).toBe('2027-03-14T07:30:00.000Z'); // 03:30 EDT
  });

  it('stretches the second half in whole weeks so weekdays hold', () => {
    const [a, b] = buildSchedule(
      [slot(2, '10:00'), slot(9, '10:00')],
      '2026-10-27',
      'America/New_York',
      4,
    );
    expect(a!.local_date).toBe('2026-10-28');
    expect(b!.local_date).toBe('2026-11-18'); // Day 9 + 14 days, still a Wednesday
    expect(weekdayOf(b!.local_date)).toBe(weekdayOf('2026-11-04'));
  });

  it('puts Day 1 on the start date and sorts by time', () => {
    const out = buildSchedule(
      [slot(3, '10:00'), slot(1, '08:00')],
      '2026-10-27',
      'America/New_York',
    );
    expect(out.map((p) => [p.day, p.local_date])).toEqual([
      [1, '2026-10-27'],
      [3, '2026-10-29'],
    ]);
  });
});
