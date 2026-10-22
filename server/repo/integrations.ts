// Settings → Integrations: is each outside service connected? Reports set / missing / error only;
// never a key, token or webhook URL.
import type { IntegrationCheck } from '../../src/types/api.js';
import { eq, first, list, str, T } from '../airtable.js';
import { dropboxConfigured, listFolders } from '../dropbox.js';
import { env, isMock } from '../env.js';
import { WEBHOOK_ENV } from '../publish-map.js';

const PLATFORM_NAME: Array<[string, string]> = [
  ['facebook', 'Facebook'],
  ['instagram_reels', 'Instagram (Reels and Feed)'],
  ['tiktok', 'TikTok'],
  ['youtube_shorts', 'YouTube Shorts'],
  ['youtube', 'YouTube (long video)'],
  ['threads', 'Threads'],
  ['x', 'Twitter / X'],
  ['pinterest', 'Pinterest'],
];

const set = (name: string) => !!env(name);
const msg = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 160);

async function lastUsage(provider: string): Promise<string | null> {
  const rec = await first(T.usageLog, {
    filterByFormula: eq('Provider', provider),
    sort: [{ field: 'Created', direction: 'desc' }],
  });
  return rec ? (str(rec.fields, 'Created') ?? rec.createdTime) : null;
}

export async function integrationChecks(): Promise<IntegrationCheck[]> {
  const out: IntegrationCheck[] = [];
  const add = (c: IntegrationCheck) => out.push(c);

  add({
    group: 'App',
    name: 'Mode',
    status: isMock() ? 'error' : 'ok',
    detail: isMock() ? 'Mock mode is ON: nothing real is sent or generated.' : 'Live',
    at: null,
  });

  const started = Date.now();
  try {
    await list(T.settings, { maxRecords: 1 });
    add({
      group: 'Services',
      name: 'Airtable',
      status: 'ok',
      detail: `Connected (${Date.now() - started} ms)`,
      at: null,
    });
  } catch (err) {
    add({ group: 'Services', name: 'Airtable', status: 'error', detail: msg(err), at: null });
  }

  add({
    group: 'Services',
    name: 'Claude (Anthropic)',
    status: set('ANTHROPIC_API_KEY') ? 'ok' : 'missing',
    detail: set('ANTHROPIC_API_KEY')
      ? 'Key set. Last call below.'
      : 'ANTHROPIC_API_KEY is not set: nothing can be generated.',
    at: set('ANTHROPIC_API_KEY') ? await lastUsage('anthropic').catch(() => null) : null,
  });

  if (!dropboxConfigured()) {
    add({
      group: 'Services',
      name: 'Dropbox',
      status: 'missing',
      detail: 'App key, secret or refresh token is not set (npm run dropbox:connect).',
      at: null,
    });
  } else {
    try {
      await listFolders('');
      add({
        group: 'Services',
        name: 'Dropbox',
        status: 'ok',
        detail: 'Connected to the team space',
        at: null,
      });
    } catch (err) {
      add({ group: 'Services', name: 'Dropbox', status: 'error', detail: msg(err), at: null });
    }
  }

  add({
    group: 'Services',
    name: 'SerpAPI (trends)',
    status: set('SERPAPI_API_KEY') ? 'ok' : 'missing',
    detail: set('SERPAPI_API_KEY')
      ? 'Key set'
      : 'No key: “Pull trends” fails and topics use seasonal context only.',
    at: set('SERPAPI_API_KEY') ? await lastUsage('serpapi').catch(() => null) : null,
  });

  for (const [platform, name] of PLATFORM_NAME) {
    const variable = WEBHOOK_ENV[platform]!;
    add({
      group: 'Make.com webhooks',
      name,
      status: set(variable) ? 'ok' : 'missing',
      detail: set(variable)
        ? 'Webhook URL set'
        : `${variable} is not set: this platform can't be posted.`,
      at: null,
    });
  }
  add({
    group: 'Make.com webhooks',
    name: 'Shared secret',
    status: set('MAKE_WEBHOOK_SECRET') ? 'ok' : 'missing',
    detail: set('MAKE_WEBHOOK_SECRET')
      ? 'Set: sent to Make, and required on Make’s callbacks'
      : 'MAKE_WEBHOOK_SECRET is not set.',
    at: null,
  });

  const lastScan = await first(T.jobs, {
    filterByFormula: eq('Type', 'scan_uploads'),
    sort: [{ field: 'Created', direction: 'desc' }],
  }).catch(() => null);
  add({
    group: 'Automation',
    name: 'Timer secret (CRON_SECRET)',
    status: set('CRON_SECRET') ? 'ok' : 'missing',
    detail: set('CRON_SECRET') ? 'Set' : 'Not set: the every-minute timer is refused.',
    at: null,
  });
  add({
    group: 'Automation',
    name: 'Every-minute timer (posting and video check)',
    status: lastScan ? 'ok' : 'missing',
    detail: lastScan
      ? 'Last video check below. If it is older than 10 minutes, the timer is not running.'
      : 'Has not run yet. It starts once the app is on Vercel Pro.',
    at: lastScan ? (str(lastScan.fields, 'Created') ?? lastScan.createdTime) : null,
  });

  const pending = await list(T.scheduledPosts, {
    filterByFormula: eq('Publish Status', 'failed'),
    maxRecords: 50,
  }).catch(() => []);
  add({
    group: 'Automation',
    name: 'Failed posts',
    status: pending.length ? 'error' : 'ok',
    detail: pending.length
      ? `${pending.length} post(s) failed: open the Calendar and click them`
      : 'None',
    at: null,
  });
  return out;
}
