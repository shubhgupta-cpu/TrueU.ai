// SerpAPI client: rising queries, top YouTube results and "People also ask" per seed keyword
// (docs/integrations.md §2).
import { env, isMock, requireEnv } from './env.js';
import { fixture } from './fixtures/index.js';
import { usage } from './log.js';
import { fetchJson, withRetry } from './retry.js';

export type TrendEngine = 'google_trends' | 'youtube' | 'google';

export interface TrendItem {
  engine: TrendEngine;
  query: string;
  value?: string;
  url?: string;
}

interface TrendsResponse {
  related_queries?: { rising?: Array<{ query: string; value?: string | number; link?: string }> };
}
interface YoutubeResponse {
  video_results?: Array<{ title: string; link?: string; views?: number }>;
}
interface GoogleResponse {
  related_questions?: Array<{ question: string; link?: string }>;
}

const ENGINE_PARAMS: Record<TrendEngine, (keyword: string) => Record<string, string>> = {
  google_trends: (q) => ({ engine: 'google_trends', q, data_type: 'RELATED_QUERIES' }),
  youtube: (q) => ({ engine: 'youtube', search_query: q }),
  google: (q) => ({ engine: 'google', q }),
};

async function search<T>(engine: TrendEngine, keyword: string, jobId?: string | null): Promise<T> {
  if (isMock()) return fixture(`serp/${engine}`) as T;
  const params = new URLSearchParams({
    ...ENGINE_PARAMS[engine](keyword),
    api_key: requireEnv('SERPAPI_API_KEY'),
  });
  const started = Date.now();
  const res = await withRetry(() => fetchJson<T>(`https://serpapi.com/search.json?${params}`));
  await usage({ provider: 'serpapi', jobId, units: 1, durationMs: Date.now() - started });
  return res;
}

export function normaliseItems(
  trends: TrendsResponse,
  youtube: YoutubeResponse,
  google: GoogleResponse,
): TrendItem[] {
  const items: TrendItem[] = [
    ...(trends.related_queries?.rising ?? []).map((r) => ({
      engine: 'google_trends' as const,
      query: r.query,
      value: r.value === undefined ? undefined : String(r.value),
      url: r.link,
    })),
    ...(youtube.video_results ?? []).slice(0, 10).map((v) => ({
      engine: 'youtube' as const,
      query: v.title,
      value: v.views === undefined ? undefined : `${v.views} views`,
      url: v.link,
    })),
    ...(google.related_questions ?? []).map((q) => ({
      engine: 'google' as const,
      query: q.question,
      url: q.link,
    })),
  ];
  // De-duplicate across engines by normalised query text.
  const seen = new Set<string>();
  return items.filter((i) => {
    const k = i.query
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * All three engines for one keyword. One engine failing doesn't lose the others; only when every
 * engine fails does the keyword fail.
 */
export async function collectTrends(keyword: string, jobId?: string | null): Promise<TrendItem[]> {
  const [trends, youtube, google] = await Promise.allSettled([
    search<TrendsResponse>('google_trends', keyword, jobId),
    search<YoutubeResponse>('youtube', keyword, jobId),
    search<GoogleResponse>('google', keyword, jobId),
  ]);
  const results = [trends, youtube, google];
  if (results.every((r) => r.status === 'rejected')) {
    throw new Error(`SerpAPI failed for "${keyword}": ${(trends as PromiseRejectedResult).reason}`);
  }
  const value = <T>(r: PromiseSettledResult<T>) => (r.status === 'fulfilled' ? r.value : ({} as T));
  return normaliseItems(value(trends), value(youtube), value(google));
}

/**
 * The monthly strategy prompt's one Google Trends call, made by the app (Claude can't call tools
 * here): rising and top related queries for one query. Returns null when SerpAPI isn't set up or
 * the call fails, so the prompt falls back to seasonal context ("trend_data_used": false).
 */
export async function googleTrendsOnce(
  query: string,
  jobId?: string | null,
): Promise<{ rising: string[]; top: string[] } | null> {
  if (!isMock() && !env('SERPAPI_API_KEY')) return null;
  try {
    const res = await search<{
      related_queries?: {
        rising?: Array<{ query: string; value?: string | number }>;
        top?: Array<{ query: string; value?: string | number }>;
      };
    }>('google_trends', query, jobId);
    const fmt = (r: { query: string; value?: string | number }) =>
      r.value === undefined ? r.query : `${r.query} (${r.value})`;
    const rising = (res.related_queries?.rising ?? []).slice(0, 25).map(fmt);
    const top = (res.related_queries?.top ?? []).slice(0, 25).map(fmt);
    return rising.length || top.length ? { rising, top } : null;
  } catch (err) {
    console.error('google trends call failed', err);
    return null;
  }
}
