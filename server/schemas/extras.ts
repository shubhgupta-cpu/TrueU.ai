// Output contracts for cta_generate (the client's "CTA and Hook Generation Agent" v3.7) and
// poll_generate ("TrueU.ai Poll Question Generator" v1.0). docs/prompts.md §2.6–2.7.
// Structure is enforced (retry once); each prompt's limits are checked as warnings.
import { z } from 'zod';
import type { Blog } from './blog.js';
import type { Script } from './script.js';

const text = z.string().trim().min(1);

export const Ctas = z.object({
  video_id: z.string().default(''),
  ctas: z.object({
    youtube_description: z.object({
      email_cta: text,
      lead_magnet_cta: text,
      blog_cta: text,
      subscribe_cta: text,
    }),
    youtube_pinned: z.object({ primary_cta: text }),
    linkedin: z.object({ quote_text: text, caption_cta: text, comment_cta: text }),
    instagram: z.object({
      label: text,
      title: text,
      reel_overlay_cta: text,
      bio_link_cta: text,
      caption_cta: text,
    }),
    twitter: z.object({ quote_text: text, handle: text, thread_cta: text, bio_cta: text }),
    facebook: z.object({ quote_text: text, caption_cta: text, comment_cta: text }),
    pinterest: z.object({ title: text, points: text, url: text }),
  }),
  lead_magnet_match: z
    .object({ recommended: z.string(), relevance_score: z.coerce.number() })
    .partial()
    .optional(),
});
export type Ctas = z.infer<typeof Ctas>;
export type CtaGroup = keyof Ctas['ctas'];

export const CTA_GROUPS: Array<{ key: CtaGroup; label: string; main: string }> = [
  { key: 'youtube_description', label: 'YouTube description', main: 'email_cta' },
  { key: 'youtube_pinned', label: 'YouTube pinned comment', main: 'primary_cta' },
  { key: 'linkedin', label: 'LinkedIn', main: 'quote_text' },
  { key: 'instagram', label: 'Instagram', main: 'title' },
  { key: 'twitter', label: 'X / Twitter', main: 'quote_text' },
  { key: 'facebook', label: 'Facebook', main: 'quote_text' },
  { key: 'pinterest', label: 'Pinterest', main: 'title' },
];

/** Target lengths from the prompt; it allows finishing a word up to 2 characters over. */
export const CTA_TARGETS: Partial<Record<CtaGroup, Record<string, number>>> = {
  linkedin: { quote_text: 130 },
  instagram: { label: 15, title: 60, reel_overlay_cta: 25 },
  twitter: { quote_text: 100, handle: 15 },
  facebook: { quote_text: 150 },
  pinterest: { title: 60, points: 150 },
};

export const fieldLabel = (k: string) =>
  k
    .replace(/_/g, ' ')
    .replace(/\bcta\b/i, 'CTA')
    .replace(/^./, (c) => c.toUpperCase());

export function ctaWarnings(group: CtaGroup, fields: Record<string, string>): string[] {
  const out: string[] = [];
  for (const [k, max] of Object.entries(CTA_TARGETS[group] ?? {})) {
    const v = fields[k] ?? '';
    if (v.length > max + 2)
      out.push(`${fieldLabel(k)} is ${v.length} characters (target ${max}, at most 2 over)`);
  }
  for (const [k, v] of Object.entries(fields)) {
    if (/—/.test(v)) out.push(`${fieldLabel(k)} contains an em dash`);
  }
  if (group === 'instagram') {
    const label = fields['label'] ?? '';
    if (label !== label.toUpperCase()) out.push('Label must be ALL CAPS');
    const overlay = (fields['reel_overlay_cta'] ?? '').trim();
    const words = overlay
      .replace(/\s*(→|->|➜|➡️?|»)\s*$/u, '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!/(→|->|➜|➡|»)$/u.test(overlay)) out.push('Reel overlay CTA must end with an arrow');
    if (words.length !== 3)
      out.push(`Reel overlay CTA has ${words.length} words before the arrow (exactly 3)`);
    if (/\p{Extended_Pictographic}/u.test(overlay.replace(/➡️?/u, '')))
      out.push('Reel overlay CTA contains an emoji');
  }
  if (group === 'twitter' && /[@#_0-9-]|[^\w\s'’]/u.test(fields['handle'] ?? '')) {
    out.push('Handle must be plain words (no @ # _ numbers hyphens or symbols)');
  }
  return out;
}

export const Polls = z.object({
  polls: z
    .array(
      z.object({
        poll_number: z.coerce.number().optional(),
        question: text,
        category: z.string().default(''),
        expected_split: z.string().default(''),
        why_engaging: z.string().default(''),
        platform_note: z.string().default(''),
      }),
    )
    .length(5),
});
export type Polls = z.infer<typeof Polls>;

export function pollWarnings(p: Polls['polls'][number], all: Polls['polls']): string[] {
  const out: string[] = [];
  if (p.question.length > 120) out.push(`Question is ${p.question.length} characters (under 120)`);
  if (!p.question.trim().endsWith('?')) out.push('Not phrased as a question');
  const same = all.filter((x) => x !== p && x.category && x.category === p.category).length;
  if (same) out.push(`Category "${p.category}" is used by another poll (variety expected)`);
  return out;
}

/** Inputs for both prompts, from the approved script and blog and the settings. */
export function extrasInput(args: {
  topicTitle: string;
  category: string | null;
  script: Script;
  blog: Blog | null;
  videoId: string;
  blogUrlTemplate: string;
  leadMagnet: string;
  icpSegment: string;
}) {
  const s = args.script;
  const keyPoints = [
    s.opening_examples.connecting_statement,
    ...s.clip_timestamps.map((c) => c.hook_line),
    s.closing_reflection,
  ].filter((x) => x && x.trim());
  const scenes = (['scene_1', 'scene_2', 'scene_3', 'scene_4', 'scene_5', 'scene_6'] as const)
    .map((k) => s.long_form_storyboard[k].narration)
    .join(' ');
  return {
    cta: {
      video_id: args.videoId,
      video_title: s.episode_metadata.episode_title,
      category: args.blog?.category || args.category || s.episode_metadata.shared_value,
      key_points: keyPoints,
      icp_segment: args.icpSegment,
      lead_magnet: args.leadMagnet,
      blog_url: args.blog ? args.blogUrlTemplate.replace(/\{slug\}/g, args.blog.slug) : '',
    },
    poll: {
      video_title: s.episode_metadata.episode_title,
      topic: args.topicTitle,
      script_summary:
        `${s.opening_examples.example_a.story} ${s.opening_examples.example_b.story} ${s.opening_examples.connecting_statement} ${scenes}`.slice(
          0,
          4000,
        ),
      key_themes: [s.episode_metadata.shared_value, ...keyPoints].join('; '),
    },
  };
}
