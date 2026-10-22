// Vercel Cron runs in UTC, once a day (vercel.json). Each cron function checks the local *date* in
// settings.timezone and builds an idempotency key, so a repeated run does nothing twice and changing
// the timezone needs no cron edits.

export interface LocalParts {
  year: number;
  month: number; // 1–12
  day: number; // 1–31
  weekday: number; // 0 = Sunday … 6 = Saturday
  hour: number; // 0–23
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function localParts(now: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    hourCycle: 'h23',
    weekday: 'short',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    weekday: WEEKDAYS.indexOf(get('weekday')),
    hour: Number(get('hour')),
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** F2.2: the 1st Monday of the month (local date). Returns the run's idempotency key, or null. */
export function monthlyTopicsRunKey(now: Date, timeZone: string): string | null {
  const p = localParts(now, timeZone);
  if (p.weekday !== 1 || p.day > 7) return null;
  return `generate_topics:${p.year}-${pad(p.month)}`;
}

/** F2.3: every Monday (local date). Returns the run's idempotency key, or null. */
export function weeklyTrendsRunKey(now: Date, timeZone: string): string | null {
  const p = localParts(now, timeZone);
  if (p.weekday !== 1) return null;
  return `pull_trends:${p.year}-${pad(p.month)}-${pad(p.day)}`;
}
