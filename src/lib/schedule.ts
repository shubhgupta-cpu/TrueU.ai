// Pure scheduling math, shared by the server (persist) and the UI (preview). docs/publishing-schedule.md §2.
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

export interface SlotDef {
  id: string;
  asset_role: string | null;
  platform: string;
  day: number;
  local_time: string;
  window_end: string | null;
  allow_best_time: boolean;
  media_type: string;
  notes: string | null;
}

export interface PlannedSlot extends SlotDef {
  local_date: string;
  scheduled_at: string;
}

/** 'YYYY-MM-DD' plus n days (calendar arithmetic in UTC, so no DST surprises). */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday. */
export const weekdayOf = (date: string): number => new Date(`${date}T00:00:00Z`).getUTCDay();

/** Local date + time in `timeZone` → UTC ISO. A time skipped by spring-forward lands on the first valid minute. */
export function localToUtc(date: string, time: string, timeZone: string): string {
  const utc = fromZonedTime(`${date}T${time}:00`, timeZone);
  // fromZonedTime moves a skipped time back an hour; the local clock then reads earlier, so push it one hour on.
  const gap = formatInTimeZone(utc, timeZone, 'HH:mm') !== time;
  return (gap ? new Date(utc.getTime() + 3_600_000) : utc).toISOString();
}

/** A 3 or 4 week plan pushes the second half (Day 8 on) later in whole weeks, so every post keeps its weekday. */
export const stretchDay = (day: number, weeks: number): number =>
  day >= 8 ? day + (weeks - 2) * 7 : day;

export function buildSchedule(
  slots: SlotDef[],
  day1: string,
  timeZone: string,
  weeks = 2,
): PlannedSlot[] {
  return slots
    .map((s) => {
      const local_date = addDays(day1, stretchDay(s.day, weeks) - 1);
      return { ...s, local_date, scheduled_at: localToUtc(local_date, s.local_time, timeZone) };
    })
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
}
