// Airtable is the app's database. This is the only module that talks to its REST API.
// Tables and fields are referenced by name: the structure is defined in scripts/airtable/schema.mjs
// (apply with `npm run airtable:apply`). Renaming a table, field or select option in Airtable
// breaks the app — add new ones instead.
import { requireEnv } from './env.js';

export type Fields = Record<string, unknown>;

export interface AtRecord {
  id: string;
  createdTime: string;
  fields: Fields;
}

export const T = {
  users: 'Users',
  settings: 'Settings',
  prompts: 'Prompts',
  seedKeywords: 'Seed Keywords',
  topics: 'Topics',
  topicScores: 'Topic Scores',
  scheduleTemplates: 'Schedule Templates',
  scheduleSlots: 'Schedule Slots',
  scheduledPosts: 'Scheduled Posts',
  assets: 'Assets',
  projects: 'Projects',
  scriptVersions: 'Script Versions',
  blogVersions: 'Blog Versions',
  captionSets: 'Caption Sets',
  contentItems: 'Content Items',
  approvals: 'Approvals',
  jobs: 'Jobs',
  activityLog: 'Activity Log',
  usageLog: 'Usage Log',
  notifications: 'Notifications',
} as const;
export type TableName = (typeof T)[keyof typeof T];

export class AirtableError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Airtable allows 5 requests/second per base. Calls from one instance are spaced out. */
const MIN_SPACING_MS = 210;
/** After a 429 Airtable asks clients to wait 30 seconds. */
const RATE_LIMIT_WAIT_MS = 30_000;
let nextSlot = 0;

async function slot(): Promise<void> {
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + MIN_SPACING_MS;
  if (at > now) await sleep(at - now);
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = requireEnv('AIRTABLE_TOKEN');
  const base = requireEnv('AIRTABLE_BASE_ID');
  for (let attempt = 0; ; attempt++) {
    await slot();
    let res: Response;
    try {
      res = await fetch(`https://api.airtable.com/v0/${base}/${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      if (attempt < 2) continue; // network blip
      throw err;
    }
    if (res.status === 429 && attempt < 2) {
      await sleep(RATE_LIMIT_WAIT_MS);
      continue;
    }
    if (res.status >= 500 && attempt < 2) {
      await sleep(500 * 2 ** attempt);
      continue;
    }
    const data = (await res.json().catch(() => ({}))) as {
      error?: { type?: string; message?: string } | string;
    };
    if (!res.ok) {
      const e = data.error;
      const msg = typeof e === 'string' ? e : (e?.message ?? e?.type ?? res.statusText);
      throw new AirtableError(`Airtable ${method} ${path.split('?')[0]}: ${msg}`, res.status);
    }
    return data as T;
  }
}

const tablePath = (table: TableName) => encodeURIComponent(table);

export interface ListOptions {
  filterByFormula?: string;
  sort?: Array<{ field: string; direction?: 'asc' | 'desc' }>;
  fields?: string[];
  maxRecords?: number;
}

export async function list(table: TableName, opts: ListOptions = {}): Promise<AtRecord[]> {
  const out: AtRecord[] = [];
  let offset: string | undefined;
  do {
    const q = new URLSearchParams({ pageSize: '100' });
    if (opts.filterByFormula) q.set('filterByFormula', opts.filterByFormula);
    if (opts.maxRecords) q.set('maxRecords', String(opts.maxRecords));
    opts.sort?.forEach((s, i) => {
      q.set(`sort[${i}][field]`, s.field);
      q.set(`sort[${i}][direction]`, s.direction ?? 'asc');
    });
    opts.fields?.forEach((f) => q.append('fields[]', f));
    if (offset) q.set('offset', offset);
    const page = await call<{ records: AtRecord[]; offset?: string }>(
      'GET',
      `${tablePath(table)}?${q}`,
    );
    out.push(...page.records);
    offset = page.offset;
  } while (offset);
  return out;
}

export async function first(table: TableName, opts: ListOptions): Promise<AtRecord | null> {
  return (await list(table, { ...opts, maxRecords: 1 }))[0] ?? null;
}

export async function get(table: TableName, id: string): Promise<AtRecord | null> {
  if (!/^rec[A-Za-z0-9]{14}$/.test(id)) return null;
  try {
    return await call<AtRecord>('GET', `${tablePath(table)}/${id}`);
  } catch (err) {
    if (err instanceof AirtableError && err.status === 404) return null;
    throw err;
  }
}

/** `typecast` lets Airtable accept new select options and link IDs as written. */
export async function create(table: TableName, records: Fields[]): Promise<AtRecord[]> {
  const out: AtRecord[] = [];
  for (let i = 0; i < records.length; i += 10) {
    const page = await call<{ records: AtRecord[] }>('POST', tablePath(table), {
      records: records.slice(i, i + 10).map((fields) => ({ fields })),
      typecast: true,
    });
    out.push(...page.records);
  }
  return out;
}

export async function createOne(table: TableName, fields: Fields): Promise<AtRecord> {
  return (await create(table, [fields]))[0]!;
}

/** PATCH: only the given fields change. Set a field to null to clear it. */
export async function update(
  table: TableName,
  records: Array<{ id: string; fields: Fields }>,
): Promise<AtRecord[]> {
  const out: AtRecord[] = [];
  for (let i = 0; i < records.length; i += 10) {
    const page = await call<{ records: AtRecord[] }>('PATCH', tablePath(table), {
      records: records.slice(i, i + 10),
      typecast: true,
    });
    out.push(...page.records);
  }
  return out;
}

export async function updateOne(table: TableName, id: string, fields: Fields): Promise<AtRecord> {
  return (await update(table, [{ id, fields }]))[0]!;
}

export async function destroy(table: TableName, ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i += 10) {
    const q = new URLSearchParams();
    ids.slice(i, i + 10).forEach((id) => q.append('records[]', id));
    await call('DELETE', `${tablePath(table)}?${q}`);
  }
}

// ---- formula helpers (values are always escaped; never interpolate raw input)

/** A formula string literal. */
export const lit = (v: string): string => JSON.stringify(v);
export const field = (name: string): string => `{${name.replace(/[{}]/g, '')}}`;
export function eq(name: string, v: string | number | boolean): string {
  if (typeof v === 'string') return `${field(name)}=${lit(v)}`;
  if (typeof v === 'number') return `${field(name)}=${v}`;
  return v ? field(name) : `NOT(${field(name)})`; // checkbox: unchecked is blank, not FALSE
}
export const and = (...parts: string[]): string =>
  parts.length === 1 ? parts[0]! : `AND(${parts.join(',')})`;
export const or = (...parts: string[]): string =>
  parts.length === 0 ? 'FALSE()' : parts.length === 1 ? parts[0]! : `OR(${parts.join(',')})`;
export const byIds = (ids: string[]): string => or(...ids.map((id) => `RECORD_ID()=${lit(id)}`));
export const isIn = (name: string, values: string[]): string =>
  or(...values.map((v) => eq(name, v)));

// ---- reading fields

export const str = (f: Fields, name: string): string | null => {
  const v = f[name];
  return typeof v === 'string' && v !== '' ? v : null;
};
export const num = (f: Fields, name: string): number | null => {
  const v = f[name];
  return typeof v === 'number' ? v : null;
};
export const bool = (f: Fields, name: string): boolean => f[name] === true;
/** First linked record ID, or null. */
export const link = (f: Fields, name: string): string | null => {
  const v = f[name];
  return Array.isArray(v) && typeof v[0] === 'string' ? v[0] : null;
};
export const links = (f: Fields, name: string): string[] => {
  const v = f[name];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
};
/** A JSON long-text field, parsed. Bad JSON (e.g. edited by hand) returns the fallback. */
export function jsonField<T>(f: Fields, name: string, fallback: T): T {
  const v = f[name];
  if (typeof v !== 'string' || v.trim() === '') return fallback;
  try {
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
}
export const toJson = (v: unknown): string => JSON.stringify(v, null, 2);
export const nowIso = (): string => new Date().toISOString();
