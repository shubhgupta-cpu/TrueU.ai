import { formatInTimeZone } from 'date-fns-tz';

/** First day of the month `now` falls in, in the settings time zone: 'YYYY-MM-01' (projects.cycle_month). */
export function cycleMonth(now: Date, timeZone: string): string {
  return formatInTimeZone(now, timeZone, 'yyyy-MM-01');
}

/** 'YYYY-MM' of a timestamp, in the settings time zone. */
export function monthKey(iso: string, timeZone: string): string {
  return formatInTimeZone(new Date(iso), timeZone, 'yyyy-MM');
}

export function formatMonth(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, 1)).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function formatDateTime(iso: string, timeZone: string): string {
  return formatInTimeZone(new Date(iso), timeZone, 'd MMM yyyy, HH:mm');
}

export function formatDate(iso: string, timeZone: string): string {
  return formatInTimeZone(new Date(iso), timeZone, 'd MMM yyyy');
}
