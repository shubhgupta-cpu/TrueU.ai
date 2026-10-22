// Typed view of the Airtable "Settings" table (docs/spec.md §8): one row per key, JSON in Value.
// Missing or unparsable keys fall back to the documented default.
import { memo } from './cache.js';
import { list, T } from './airtable.js';
import { DEFAULT_LAYOUT, type FolderLayout } from './paths.js';

export interface Settings {
  timezone: string;
  score_threshold: number;
  score_max: number;
  videos_per_month: number;
  claude_topics_per_batch: number;
  max_trend_topics_per_run: number;
  topic_categories: string[];
  brand_context: Record<string, unknown>;
  auto_regenerate_topics: boolean;
  models: { default: string; fast: string };
  dropbox: Partial<FolderLayout> & { settle_minutes?: number; media_url_strategy?: string };
  /** {{weekly_hashtags}} for the social prompt (the old WEEKLY_HASHTAG_SETS). Empty = the script's hashtags. */
  weekly_hashtags: string[];
  /** {{content_url}} for the social prompt; {slug} = the approved blog's slug. */
  social_content_url: string;
  /** {{blog_url}} for the CTA prompt; {slug} = the approved blog's slug. */
  blog_url: string;
  /** {{lead_magnet}} for the CTA prompt (optional). */
  lead_magnet: string;
  /** The one Google Trends query the monthly topic agent's search step uses. */
  monthly_trend_query: string;
}

export const DEFAULTS: Settings = {
  timezone: 'UTC', // TODO(OQ-6)
  score_threshold: 45,
  score_max: 60,
  videos_per_month: 4,
  claude_topics_per_batch: 15,
  max_trend_topics_per_run: 10,
  topic_categories: ['Identity', 'Relationships', 'Values', 'Transitions'],
  brand_context: {},
  auto_regenerate_topics: true,
  models: { default: 'claude-haiku-5-5', fast: 'claude-haiku-5-5' },
  dropbox: { ...DEFAULT_LAYOUT, settle_minutes: 5, media_url_strategy: 'dropbox_shared_link' }, // TODO(OQ-3)
  weekly_hashtags: [],
  // TODO: confirm the blog's public URL pattern with the client.
  social_content_url:
    'https://trueu.ai/blog/{slug}?utm_source=social&utm_medium=organic&utm_campaign={slug}',
  blog_url: 'https://trueu.ai/blog/{slug}', // TODO: confirm the blog URL with the client
  lead_magnet: '',
  monthly_trend_query: 'career change',
};

/** Every setting as parsed JSON, keyed by Key. Cached for 10 s per instance (dropped when settings are saved here). */
export function allSettings(): Promise<Record<string, unknown>> {
  return memo('settings', 10_000, readSettings);
}

async function readSettings(): Promise<Record<string, unknown>> {
  const rows = await list(T.settings, { fields: ['Key', 'Value'] });
  const out: Record<string, unknown> = {};
  for (const r of rows) {
    const key = r.fields['Key'];
    const raw = r.fields['Value'];
    if (typeof key !== 'string' || typeof raw !== 'string') continue;
    try {
      out[key] = JSON.parse(raw);
    } catch {
      // A hand-edited value that isn't JSON: treat plain text as a string.
      out[key] = raw;
    }
  }
  return out;
}

/** Admins change settings live in the app or in Airtable; a change shows within 10 s. */
export async function getSettings<K extends keyof Settings>(
  keys: readonly K[],
): Promise<Pick<Settings, K>> {
  const all = await allSettings();
  const out = {} as Pick<Settings, K>;
  for (const key of keys) {
    const v = all[key];
    out[key] = (v === undefined || v === null ? DEFAULTS[key] : v) as Settings[K];
  }
  return out;
}
