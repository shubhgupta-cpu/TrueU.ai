// Pure helpers shared by the topic jobs and functions.

export interface TopicLike {
  title: string;
  description: string | null;
}

/** The text a prompt scores: the title, plus the description when there is one. */
export function topicText(t: TopicLike): string {
  const description = t.description?.trim();
  return description ? `${t.title.trim()}\n\n${description}` : t.title.trim();
}

/** Statuses a (re)score may move. A selected, saved or rejected topic keeps its status. */
export const SCORABLE_STATUSES = ['new', 'scoring', 'qualified', 'needs_work', 'error'] as const;

export function isScorable(status: string): boolean {
  return (SCORABLE_STATUSES as readonly string[]).includes(status);
}

/** YYYY-MM-DD in the given IANA time zone. */
export function localDate(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Formats improvements as the bullet list passed to topic_regenerate as {{prior_improvements}}. */
export function formatImprovements(items: string[]): string {
  return items.map((s) => `- ${s}`).join('\n');
}

/** pg_trgm-style trigrams: each word padded with two leading spaces and one trailing space. */
export function trigrams(text: string): Set<string> {
  const out = new Set<string>();
  for (const word of text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)) {
    const padded = `  ${word} `;
    for (let i = 0; i < padded.length - 2; i++) out.add(padded.slice(i, i + 3));
  }
  return out;
}

/** Trigram similarity 0–1 (shared / union), like Postgres pg_trgm similarity(). */
export function similarity(a: string, b: string): number {
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (!ta.size || !tb.size) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / (ta.size + tb.size - shared);
}

/** F2.4: a new topic whose title is > 0.6 similar to one from the last 12 months is flagged. */
export const DUPLICATE_THRESHOLD = 0.6;

export function findDuplicate<T extends { id: string; title: string; created_at: string }>(
  title: string,
  existing: T[],
  now: Date,
): T | null {
  const since = now.getTime() - 365 * 86_400_000;
  let best: { t: T; s: number } | null = null;
  for (const t of existing) {
    if (Date.parse(t.created_at) < since) continue;
    const s = similarity(title, t.title);
    if (s > DUPLICATE_THRESHOLD && (!best || s > best.s)) best = { t, s };
  }
  return best?.t ?? null;
}
