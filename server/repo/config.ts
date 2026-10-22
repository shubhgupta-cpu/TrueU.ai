// Settings → Platforms (read-only reference) and Schedule templates (editable slots).
import type { PlatformRule, TemplateSlot } from '../../src/types/api.js';
import { bool, first, link, list, nowIso, num, str, T, updateOne, eq } from '../airtable.js';
import { VISIBLE_CHARS } from '../../src/lib/preview.js';
import { PLATFORM_LABEL } from '../../src/lib/preview.js';
import { HttpError } from '../http.js';
import { activity } from '../log.js';
import { CHANNEL_SPECS } from '../schemas/captions.js';
import { webhookBody, WEBHOOK_ENV } from '../publish-map.js';

const ORDER = [
  'youtube',
  'youtube_shorts',
  'instagram_reels',
  'instagram_feed',
  'facebook',
  'tiktok',
  'threads',
  'x',
  'pinterest',
];

/** The limits and webhook fields the app really uses (not editable: they come from the client's prompts). */
export function platformRules(): PlatformRule[] {
  const specByPlatform = new Map<string, (typeof CHANNEL_SPECS)[keyof typeof CHANNEL_SPECS]>();
  for (const spec of Object.values(CHANNEL_SPECS)) {
    specByPlatform.set(spec.platform.video, spec);
    specByPlatform.set(spec.platform.image, spec);
  }
  const dummy = { video_title: '', video_url: '', post_content: '', hashtags: '' };
  return ORDER.map((platform) => {
    const spec = specByPlatform.get(platform);
    return {
      platform,
      label: PLATFORM_LABEL[platform] ?? platform,
      caption_min: spec?.caption[0] ?? null,
      caption_max: spec?.caption[1] ?? null,
      visible_chars: VISIBLE_CHARS[platform] ?? null,
      webhook_fields: Object.keys(webhookBody(platform, dummy)),
      webhook_env: WEBHOOK_ENV[platform] ?? null,
    };
  });
}

async function defaultTemplate() {
  const tpl = await first(T.scheduleTemplates, { filterByFormula: eq('Default', true) });
  if (!tpl) throw new HttpError(409, 'No default schedule template. Run npm run airtable:seed.');
  return tpl;
}

export async function templateSlots(): Promise<{
  name: string;
  day1_weekday: number;
  slots: TemplateSlot[];
}> {
  const tpl = await defaultTemplate();
  const rows = await list(T.scheduleSlots, { sort: [{ field: 'Sort Order', direction: 'asc' }] });
  return {
    name: str(tpl.fields, 'Name') ?? 'Schedule',
    day1_weekday: num(tpl.fields, 'Day 1 Weekday') ?? 2,
    slots: rows
      .filter((r) => link(r.fields, 'Template') === tpl.id)
      .map((r) => ({
        id: r.id,
        day: num(r.fields, 'Day Number') ?? 1,
        platform: str(r.fields, 'Platform') ?? '',
        asset_role: str(r.fields, 'Asset Role'),
        local_time: str(r.fields, 'Local Time') ?? '09:00',
        notes: str(r.fields, 'Notes'),
        best_time: bool(r.fields, 'Allow Best Time'),
      }))
      .sort((a, b) => a.day - b.day || a.local_time.localeCompare(b.local_time)),
  };
}

export async function updateSlot(
  id: string,
  change: { local_time?: string; day?: number; asset_role?: string },
  actor: string,
): Promise<void> {
  const fields: Record<string, unknown> = {
    ...(change.local_time ? { 'Local Time': change.local_time } : {}),
  };
  if (change.day !== undefined) fields['Day Number'] = change.day;
  if (change.asset_role) fields['Asset Role'] = change.asset_role;
  if (!Object.keys(fields).length) return;
  const slot = (
    await list(T.scheduleSlots, { filterByFormula: `RECORD_ID()="${id}"`, maxRecords: 1 })
  )[0];
  if (!slot) throw new HttpError(404, 'Slot not found');
  await updateOne(T.scheduleSlots, id, fields);
  await activity({
    event: 'schedule_slot_changed',
    actorId: actor,
    details: { slot: id, ...change, at: nowIso() },
  });
}
