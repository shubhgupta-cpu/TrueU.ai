// Default configuration for a new base:
// settings, placeholder prompts, the client's 15-day schedule template, the Dropbox sync row.
// Each table is seeded only if it's empty, so running this twice is safe.
//
//   node scripts/airtable/seed.mjs
import { client, loadEnv, readManifest } from './lib.mjs';

const env = loadEnv();
const at = client(env);
const { tables } = readManifest(env.baseId);
const now = new Date().toISOString();

const SETTINGS = [
  ['timezone', 'America/New_York', 'IANA timezone for schedules, SLAs and cron checks (Eastern, per the client calendar)'],
  ['score_threshold', 45, 'Minimum topic score to qualify'],
  ['score_max', 60, 'Maximum topic score'],
  ['videos_per_month', 4, 'Monthly topic slots'],
  ['claude_topics_per_batch', 15, 'Topics per monthly Claude batch'],
  ['max_trend_topics_per_run', 10, 'Cap on SerpAPI-derived topics per run'],
  ['topic_categories', ['Identity', 'Relationships', 'Values', 'Transitions'], 'Topic categories'],
  ['team', { owner_emails: [], editor_emails: [], backup_approver_emails: [] }, 'Email recipients. TODO(OQ-14)'],
  ['brand_context', { brand_name: 'TrueU.ai', voice: 'TODO', audience: 'TODO', offer: 'TODO', banned_phrases: [] }, 'Passed to every prompt as {{brand_context}}'],
  ['sla', { client_script_approval: { reminder_1: 5, reminder_2: 8, escalate: 10 }, editor_videos: { reminder_1: 5, reminder_2: 8, escalate: 10, error: 15 } }, 'Business days'],
  ['sla_holidays', [], 'Dates (YYYY-MM-DD) excluded from business days. TODO(OQ-13)'],
  ['approval_link_ttl_days', 14, 'Email approval link lifetime'],
  ['publish_approval_cutoff_hours', 24, 'Remind owner if a post is still unapproved this long before its slot'],
  ['min_lead_days', 2, 'Earliest Day 1 = today + this'],
  ['clash_window_hours', 3, 'Warn when two posts hit the same platform within this window'],
  ['dropbox', {
    root: '',
    year_folder: 'Year - {YYYY}',
    month_folder: '{Month} {YYYY}',
    subfolders: ['B_Roll', 'Backgrounds', 'Bannerbear Images all Platforms', 'Blog_Script', 'Chat Reel Video', 'Clips for Editor', 'FINAL', 'Graphics', 'Long Youtube Final Video', 'Podcast', 'RAW', 'Resize Video', 'Script', 'Short Final Video', 'Thumbnail'],
    script_folder: 'Script',
    blog_folder: 'Blog_Script',
    settle_minutes: 5,
    media_url_strategy: 'dropbox_shared_link',
  }, 'Dropbox folder layout: {root}/{year_folder}/{month_folder}/<Topic name>/<subfolders>. root "" = top of the team space. TODO(OQ-3)'],
  ['graphics_set', [], 'Bannerbear template UIDs rendered per project. TODO(OQ-9)'],
  ['models', { default: 'claude-haiku-5-5', fast: 'claude-haiku-5-5' }, 'Claude model IDs'],
  ['newsletter_slot', { day_number: 3, local_time: '09:00' }, 'TODO(OQ-8)'],
  ['weekly_hashtags', [], 'Hashtags for this week, used as the third hashtag of social posts (the old WEEKLY_HASHTAG_SETS). Empty = the script\'s YouTube hashtags'],
  ['social_content_url', 'https://trueu.ai/blog/{slug}?utm_source=social&utm_medium=organic&utm_campaign={slug}', 'Link in social posts. {slug} = the approved blog slug. TODO: confirm the blog URL'],
  ['blog_url', 'https://trueu.ai/blog/{slug}', 'Blog link for the CTA prompt. {slug} = the approved blog slug. TODO: confirm the blog URL'],
  ['monthly_trend_query', 'career change', 'The one Google Trends query used by the monthly topic agent (needs SerpAPI)'],
  ['lead_magnet', '', 'Lead magnet offered in CTAs (e.g. a free guide and its link). Empty = none'],
  ['auto_regenerate_topics', true, 'Rewrite a topic once with topic_regenerate when it scores below the threshold'],
  ['platform_rules', {
    youtube: { title_max: 100, caption_max: 5000, hashtags_max: 15, visible_chars: 157, link_ok: true },
    youtube_shorts: { title_max: 100, caption_max: 5000, hashtags_max: 3, link_ok: false },
    instagram_reels: { caption_max: 2200, hashtags_max: 30, visible_chars: 125, link_ok: false },
    instagram_feed: { caption_max: 2200, hashtags_max: 30, visible_chars: 125, link_ok: false },
    instagram_story: { caption_max: 0, hashtags_max: 0, link_ok: false },
    tiktok: { caption_max: 2200, hashtags_max: 8, visible_chars: 100, link_ok: false },
    facebook: { caption_max: 5000, hashtags_max: 5, visible_chars: 125, link_ok: true },
    x: { caption_max: 280, hashtags_max: 3, link_ok: true, link_counts_as: 23 },
    threads: { caption_max: 500, hashtags_max: 1, link_ok: true },
    pinterest: { title_max: 100, caption_max: 500, hashtags_max: 10, link_ok: true },
    linkedin: { caption_max: 3000, hashtags_max: 5, visible_chars: 210, link_ok: true },
  }, 'Caption validation rules. Confirm against current platform limits before launch'],
];

const PROMPTS = [
  ['topic_generate', 'Topic generation (Claude batch)', 'client'],
  ['trend_to_topic', 'Trend → topic', 'ours'],
  ['topic_score', 'Topic scoring (6 criteria / 60)', 'client'],
  ['topic_regenerate', 'Topic regeneration (rewrite + rescore)', 'client'],
  ['script_generate', 'Script generation', 'client'],
  ['script_regenerate', 'Script regeneration', 'client'],
  ['blog_generate', 'Blog post', 'client/ours'],
  ['newsletter_generate', 'Newsletter', 'client/ours'],
  ['youtube_metadata_generate', 'YouTube metadata', 'ours'],
  ['captions_generate', 'Platform captions', 'client/ours'],
  ['graphics_copy_generate', 'Bannerbear graphics copy', 'ours'],
  ['quick_rewrite', 'Quick rewrite', 'ours'],
];

// Client plan, 30 Sep 2026; Short 2/3 swaps and the newsletter from the client's calendar image, 22 Oct 2026. [asset_role, day, platform, local_time, window_end, best_time, media, notes]
const SLOTS = [
  ['long_video', 1, 'youtube', '08:00', '10:00', false, 'video', null],
  ['short_1', 2, 'threads', '18:00', null, true, 'video', 'TODO(OQ-1): Short 1 assumed'],
  ['short_1', 2, 'instagram_reels', '22:00', null, true, 'video', null],
  [null, 2, 'blog', '09:00', null, false, 'text', 'Any time Day 2–4 (Wed–Fri); must include YouTube link'],
  ['short_1', 3, 'facebook', '13:00', '14:00', false, 'video', null],
  ['short_1', 3, 'youtube_shorts', '14:00', null, false, 'video', 'if possible'],
  ['short_1', 4, 'x', '11:00', null, true, 'video', null],
  ['short_1', 4, 'tiktok', '14:00', null, true, 'video', null],
  ['short_1', 5, 'pinterest', '10:00', null, false, 'video', 'soft'],
  ['short_2', 6, 'instagram_feed', '08:00', null, false, 'video', 'TODO(OQ-3b): video or graphic?'],
  ['short_2', 7, 'youtube_shorts', '13:00', null, false, 'video', null],
  ['short_2', 8, 'threads', '08:00', null, false, 'video', null],
  ['short_3', 8, 'youtube_shorts', '09:00', null, false, 'video', null],
  ['short_2', 9, 'x', '08:00', null, false, 'video', null],
  ['short_2', 9, 'facebook', '19:00', null, false, 'video', null],
  ['short_2', 10, 'instagram_reels', '16:00', null, false, 'video', null],
  ['short_2', 10, 'tiktok', '19:00', null, false, 'video', null],
  ['short_3', 11, 'tiktok', '14:00', null, false, 'video', null],
  ['short_3', 12, 'instagram_feed', '10:00', null, false, 'video', 'TODO(OQ-3b): video or graphic?'],
  ['short_2', 13, 'pinterest', '18:00', null, false, 'video', null],
  ['short_3', 13, 'x', '14:00', null, false, 'video', null],
  ['short_3', 14, 'instagram_reels', '19:00', null, false, 'video', null],
  ['short_3', 15, 'facebook', '12:00', null, false, 'video', null],
  ['short_3', 15, 'pinterest', '18:00', null, false, 'video', null],
  ['short_3', 15, 'threads', '20:00', null, false, 'video', null],
  [null, 8, 'newsletter', '10:00', null, false, 'text', null],
];

async function seed(table, build) {
  const id = tables[table];
  if (!id) throw new Error(`Table ${table} isn't in manifest.json — run apply.mjs first`);
  if ((await at.list(id)).length) {
    console.log(`skip ${table}: already has records`);
    return null;
  }
  const records = await build();
  const created = await at.create(id, records);
  console.log(`seeded ${table}: ${created.length} records`);
  return created;
}

await seed('Settings', () =>
  SETTINGS.map(([key, value, description]) => ({
    Key: key,
    Value: JSON.stringify(value, null, 2),
    Description: description,
    Updated: now,
  })),
);

await seed('Prompts', () =>
  PROMPTS.map(([key, title, owner]) => ({
    Name: `${key} v1`,
    Key: key,
    Version: 1,
    Title: title,
    Body: `TODO: paste the ${owner === 'ours' ? '' : "client's "}${title.toLowerCase()} prompt`,
    Active: true,
    Notes: owner,
    Created: now,
  })),
);

const template = await seed('Schedule Templates', () => [
  {
    Name: 'Standard 15-day cycle',
    Description: 'Long video on Day 1, then Short 1 (Days 2–5), Short 3 and Short 2 across Days 6–15. Client plan received 30 Sep 2026.',
    Default: true,
    'Day 1 Weekday': 2,
    Created: now,
    Updated: now,
  },
]);

if (template) {
  await seed('Schedule Slots', () =>
    SLOTS.map(([role, day, platform, timeOfDay, windowEnd, bestTime, media, notes], i) => ({
      Name: `Day ${day} · ${role ?? 'project'} · ${platform}`,
      Template: [template[0].id],
      ...(role ? { 'Asset Role': role } : {}),
      'Day Number': day,
      Platform: platform,
      'Local Time': timeOfDay,
      ...(windowEnd ? { 'Window End': windowEnd } : {}),
      'Allow Best Time': bestTime,
      'Media Type': media,
      ...(notes ? { Notes: notes } : {}),
      'Sort Order': (i + 1) * 10,
    })),
  );
}

await seed('Dropbox Sync', () => [{ Name: 'main', Updated: now }]);
