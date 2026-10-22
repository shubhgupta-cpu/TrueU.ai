// Shared helpers for the Airtable setup scripts. Reads AIRTABLE_TOKEN / AIRTABLE_BASE_ID from
// .env.local (gitignored). Never prints the token.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
export const manifestPath = join(here, 'manifest.json');

export const envPath = join(root, '.env.local');

/** KEY=value pairs from .env.local (process.env wins). */
export function readEnvFile() {
  const env = {};
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] = m[2].trim().replace(/^"(.*)"$/, '$1');
    }
  }
  return { ...env, ...Object.fromEntries(Object.entries(process.env).filter(([, v]) => v)) };
}

export function loadEnv() {
  const env = readEnvFile();
  const token = env.AIRTABLE_TOKEN;
  const baseId = env.AIRTABLE_BASE_ID;
  if (!token || !baseId) throw new Error('Set AIRTABLE_TOKEN and AIRTABLE_BASE_ID in .env.local');
  return { token, baseId };
}

/** Sets KEY=value in .env.local, replacing an existing line or appending one. */
export function writeEnvValue(key, value) {
  const text = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  writeFileSync(envPath, re.test(text) ? text.replace(re, line) : `${text.replace(/\n?$/, '\n')}${line}\n`);
}

/** Table IDs this project created, per base. Only these tables are ever modified. */
export function readManifest(baseId) {
  if (!existsSync(manifestPath)) return { baseId, tables: {} };
  const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (m.baseId !== baseId) throw new Error(`manifest.json is for base ${m.baseId}, not ${baseId}`);
  return m;
}

export function writeManifest(m) {
  writeFileSync(manifestPath, `${JSON.stringify(m, null, 2)}\n`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Airtable allows 5 requests/second per base: space calls and retry 429s. */
export function client({ token, baseId }) {
  async function call(method, path, body) {
    for (let attempt = 0; attempt < 5; attempt++) {
      await sleep(250);
      const res = await fetch(`https://api.airtable.com/v0/${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.status === 429) {
        await sleep(30_000 / 5);
        continue;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data?.error?.message ?? data?.error?.type ?? JSON.stringify(data);
        throw new Error(`${method} ${path.replace(baseId, '<base>')} → ${res.status}: ${msg}`);
      }
      return data;
    }
    throw new Error(`${method} ${path} kept hitting the rate limit`);
  }
  return {
    tables: async () => (await call('GET', `meta/bases/${baseId}/tables`)).tables,
    createTable: (body) => call('POST', `meta/bases/${baseId}/tables`, body),
    createField: (tableId, body) => call('POST', `meta/bases/${baseId}/tables/${tableId}/fields`, body),
    list: async (tableId) => {
      const out = [];
      let offset;
      do {
        const q = new URLSearchParams({ pageSize: '100', ...(offset ? { offset } : {}) });
        const page = await call('GET', `${baseId}/${tableId}?${q}`);
        out.push(...page.records);
        offset = page.offset;
      } while (offset);
      return out;
    },
    create: async (tableId, records) => {
      const created = [];
      for (let i = 0; i < records.length; i += 10) {
        const page = await call('POST', `${baseId}/${tableId}`, {
          records: records.slice(i, i + 10).map((fields) => ({ fields })),
          typecast: true,
        });
        created.push(...page.records);
      }
      return created;
    },
  };
}
