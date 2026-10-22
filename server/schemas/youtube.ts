// Output contract for youtube_metadata_generate: the client's "YouTube SEO Metadata Generator" v2.0
// (docs/prompts.md §2.5). Run once per video: the long video and Short 1–3. Structure is enforced
// (retry once); the prompt's validation checklist is applied as warnings.
import { z } from 'zod';
import type { Script } from './script.js';

const num = z.coerce.number().optional();

export const YouTubeMeta = z.object({
  language: z.string().default('EN'),
  video_id: z.string().default(''),
  titles: z.object({
    recommended: z.string().trim().min(1),
    options: z.array(z.string()).min(1),
    character_counts: z.array(z.coerce.number()).optional(),
  }),
  description: z.object({
    full_text: z.string().trim().min(1),
    character_count: num,
    timestamps_included: z.boolean().optional(),
    trueu_section_included: z.boolean().optional(),
    cta_url: z.string().optional(),
  }),
  tags: z.array(z.string()).min(5),
  thumbnail_text_options: z
    .array(
      z.object({
        headline: z.string(),
        headline_chars: num,
        subtext: z.string().optional(),
        subtext_chars: num,
      }),
    )
    .min(1),
  thumbnail_validation: z.record(z.unknown()).optional(),
  seo_notes: z
    .object({
      primary_keyword: z.string().optional(),
      search_volume_estimate: z.string().optional(),
      competition: z.string().optional(),
      recommended_title_rationale: z.string().optional(),
    })
    .optional(),
  brand_checklist: z.record(z.unknown()).optional(),
});
export type YouTubeMeta = z.infer<typeof YouTubeMeta>;

export const YT_VIDEOS = ['long_video', 'video_1', 'video_2', 'video_3'] as const;
export type YtVideo = (typeof YT_VIDEOS)[number];
export const YT_LABEL: Record<YtVideo, string> = {
  long_video: 'Long video',
  video_1: 'Short 1',
  video_2: 'Short 2',
  video_3: 'Short 3',
};

/** "M:SS" / "MM:SS" / "H:MM:SS" → seconds. */
export function toSeconds(t: string): number {
  const parts = t.trim().split(':').map(Number);
  if (parts.some((n) => Number.isNaN(n))) return 0;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

const mmss = (sec: number) =>
  `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;

/** The hashtags at the end of a description ("#TrueUai #ThinkingPartner …"). */
export function descriptionHashtags(text: string): string {
  const lines = text.trim().split('\n').reverse();
  const line = lines.find((l) => /^\s*(#\w+\s*)+$/.test(l));
  return line?.trim().replace(/\s+/g, ' ') ?? '';
}

/** The prompt's validation checklist for one video. */
export function youtubeWarnings(
  m: YouTubeMeta,
  video: YtVideo,
  durationSec: number,
  primaryKeyword: string,
): string[] {
  const out: string[] = [];
  const t = m.titles.recommended;
  if (t.length < 50 || t.length > 60)
    out.push(`Recommended title is ${t.length} characters (target 50–60, max 70)`);
  const kw = primaryKeyword.trim().toLowerCase();
  if (kw && !t.toLowerCase().includes(kw))
    out.push('The recommended title doesn’t include the primary keyword');
  if (m.titles.options.length !== 5)
    out.push(`${m.titles.options.length} title options (5 expected)`);
  const longTitles = m.titles.options.filter((o) => o.length > 70);
  if (longTitles.length) out.push(`${longTitles.length} title option(s) over 70 characters`);

  if (m.thumbnail_text_options.length !== 3)
    out.push(`${m.thumbnail_text_options.length} thumbnail options (3 expected)`);
  m.thumbnail_text_options.forEach((o, i) => {
    if (o.headline.length > 25)
      out.push(`Thumbnail ${i + 1} headline is ${o.headline.length} characters (max 25)`);
    if ((o.subtext ?? '').length > 40)
      out.push(`Thumbnail ${i + 1} subtext is ${o.subtext!.length} characters (max 40)`);
  });

  const d = m.description.full_text;
  if (d.length < 2000 || d.length > 5000)
    out.push(`Description is ${d.length} characters (target 2,000–5,000)`);
  if (durationSec > 600 && !/(^|\n)\s*0:00\b/.test(d))
    out.push('No timestamps, though the video is over 10 minutes');
  if (!/About TrueU\.ai/i.test(d)) out.push('The "About TrueU.ai" section is missing');
  if (!/Thinking Partner/.test(d)) out.push('"Thinking Partner" isn’t mentioned');
  const tags = descriptionHashtags(d).split(' ').filter(Boolean);
  if (tags.length < 3 || tags.length > 5)
    out.push(`${tags.length} hashtags at the end of the description (3–5 expected)`);
  else if (tags[0] !== '#TrueUai' || tags[1] !== '#ThinkingPartner')
    out.push('Hashtags should start with #TrueUai #ThinkingPartner');

  if (m.tags.length < 15 || m.tags.length > 20) out.push(`${m.tags.length} tags (15–20 expected)`);
  if (video !== 'long_video' && durationSec > 180)
    out.push(`A short of ${mmss(durationSec)} is longer than 3 minutes`);
  return out;
}

/** Videos whose recommended title repeats another video's in the same set: video → warning. */
export function duplicateTitleWarnings(
  titles: Partial<Record<YtVideo, string>>,
): Partial<Record<YtVideo, string>> {
  const out: Partial<Record<YtVideo, string>> = {};
  const entries = Object.entries(titles) as Array<[YtVideo, string]>;
  for (const [video, title] of entries) {
    const same = entries
      .filter(([v, t]) => v !== video && t.trim().toLowerCase() === title.trim().toLowerCase())
      .map(([v]) => YT_LABEL[v]);
    if (same.length)
      out[video] = `Same title as ${same.join(' and ')}: YouTube viewers will see duplicates`;
  }
  return out;
}

const DOMAIN: Record<string, string> = {
  relationships: 'Relationships',
  transitions: 'Life Transition',
  identity: 'Personal Growth',
  values: 'Personal Growth',
};

const clip500 = (s: string) => (s.length <= 500 ? s : `${s.slice(0, 497).replace(/\s+\S*$/, '')}…`);

/** The prompt's inputs for one video, from the approved script and the topic score. */
export function youtubeInput(args: {
  video: YtVideo;
  topicTitle: string;
  category: string | null;
  script: Script;
  evaluation: Record<string, unknown>;
  videoId: string;
}) {
  const s = args.script;
  const ev = args.evaluation as {
    criteria_scores?: { search_intent?: { search_phrases?: unknown } };
  };
  const phrases = Array.isArray(ev.criteria_scores?.search_intent?.search_phrases)
    ? (ev.criteria_scores!.search_intent!.search_phrases as unknown[]).filter(
        (p): p is string => typeof p === 'string',
      )
    : [];
  const secondary = [
    ...new Set(
      [...phrases.slice(1), ...s.youtube_optimization.tags].map((x) => x.trim()).filter(Boolean),
    ),
  ].slice(0, 7);
  const base = {
    topic_title: args.topicTitle,
    decision_domain: DOMAIN[(args.category ?? '').toLowerCase()] ?? 'Personal Growth',
    primary_keyword: phrases[0] ?? args.topicTitle,
    secondary_keywords: secondary,
    language: 'EN',
    video_id: args.videoId,
    related_video_urls: [] as string[],
  };

  if (args.video === 'long_video') {
    const lf = s.long_form_storyboard;
    const names = [
      'Opening Examples',
      'Context and Tension',
      'Emotional Root',
      'Bridge Questions',
      'Common-Ground Reframe',
      'Reflection',
    ];
    const scenes = (
      ['scene_1', 'scene_2', 'scene_3', 'scene_4', 'scene_5', 'scene_6'] as const
    ).map((k, i) => ({
      timestamp: lf[k].time_range.split('-')[0]!.trim(),
      description: names[i]!,
    }));
    const duration =
      s.episode_metadata.total_runtime?.english ||
      lf.scene_8_outro.time_range.split('-')[1]?.trim() ||
      '11:00';
    return {
      ...base,
      video_duration: duration,
      duration_seconds: toSeconds(duration),
      script_summary: clip500(
        `${s.episode_metadata.episode_title}. ${s.opening_examples.example_a.story} ${s.opening_examples.example_b.story} ${s.opening_examples.connecting_statement} ${s.closing_reflection}`,
      ),
      key_timestamps: [
        { timestamp: '0:00', description: 'Introduction' },
        ...scenes,
        {
          timestamp: lf.scene_7_cta.time_range.split('-')[0]!.trim(),
          description: 'TrueU.ai: Your Private Thinking Partner',
        },
      ],
    };
  }

  const n = Number(args.video.slice(-1));
  const clip = s.clip_timestamps.find((c) => c.clip_number === n) ?? s.clip_timestamps[n - 1];
  const social = s.short_form_clips[n - 1];
  const [from, to] = (clip?.timecode ?? '').split('-');
  const seconds =
    from && to ? toSeconds(to) - toSeconds(from) : toSeconds(social?.duration ?? '0:50');
  return {
    ...base,
    video_duration: mmss(seconds > 0 ? seconds : 50),
    duration_seconds: seconds > 0 ? seconds : 50,
    script_summary: clip500(
      `Short ${n} of 3 cut from the episode "${s.episode_metadata.episode_title}"${clip ? ` (${clip.timecode}, ${clip.scene_location})` : ''}. ` +
        `Its title must be built on this clip's own hook and differ from the long video and the other two shorts. ` +
        `Hook: "${clip?.hook_line ?? social?.title ?? ''}". ${social?.hook_content ?? ''}`,
    ),
    key_timestamps: [],
  };
}
