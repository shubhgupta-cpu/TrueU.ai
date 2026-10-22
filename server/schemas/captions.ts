// Output contract for captions_generate: the client's "TrueU Social Media Content Generator" v2.4
// (docs/prompts.md §2.4). Structure is enforced (retry once); the prompt's limits and hashtag
// policy are checked per post as warnings, and a post with warnings is marked "needs_edit".
import { z } from 'zod';
import type { Blog } from './blog.js';
import type { Script } from './script.js';

/** The prompt says one space-separated string; an array is joined so it isn't lost. */
const Hashtags = z.preprocess((v) => (Array.isArray(v) ? v.join(' ') : v), z.string());

const Post = z.object({
  graphic_quote: z.string().optional(),
  graphic_label: z.string().optional(),
  graphic_title: z.string().optional(),
  graphic_points: z.preprocess((v) => (Array.isArray(v) ? v.join('\n') : v), z.string()).optional(),
  cover_title: z.string().optional(),
  cover_subtext: z.string().optional(),
  slides: z
    .array(
      z.object({ number: z.coerce.number().optional(), headline: z.string(), body: z.string() }),
    )
    .optional(),
  caption: z.string().optional(),
  description: z.string().optional(),
  hashtags: Hashtags,
});
export type Post = z.infer<typeof Post>;

const Four = z.object({ image: Post, video_1: Post, video_2: Post, video_3: Post });

export const Captions = z.object({
  content_title: z.string(),
  linkedin: Four,
  linkedin_carousel: z.object({ image: Post }),
  instagram: Four,
  twitter: Four,
  facebook: Four,
  pinterest: Four,
  threads: Four,
  reels_tiktok: z.object({ video_1: Post, video_2: Post, video_3: Post }),
  validation: z.record(z.unknown()).optional(),
});
export type Captions = z.infer<typeof Captions>;

export const CHANNELS = [
  'linkedin',
  'linkedin_carousel',
  'instagram',
  'twitter',
  'facebook',
  'pinterest',
  'threads',
  'reels_tiktok',
] as const;
export type Channel = (typeof CHANNELS)[number];
export type PostSlot = 'image' | 'video_1' | 'video_2' | 'video_3';

interface Limits {
  label: string;
  /** Schedule platform (ENUMS.platform) for image and video posts. */
  platform: { image: string; video: string };
  caption: [number, number];
  /** Pinterest's text field is "description". */
  captionField: 'caption' | 'description';
  graphic?: Partial<
    Record<
      | 'graphic_quote'
      | 'graphic_label'
      | 'graphic_title'
      | 'graphic_points'
      | 'cover_title'
      | 'cover_subtext',
      number
    >
  >;
}

/** The prompt's platform specifications (<platform_specifications>). */
export const CHANNEL_SPECS: Record<Channel, Limits> = {
  linkedin: {
    label: 'LinkedIn',
    platform: { image: 'linkedin', video: 'linkedin' },
    caption: [1000, 1800],
    captionField: 'caption',
    graphic: { graphic_quote: 150 },
  },
  linkedin_carousel: {
    label: 'LinkedIn carousel',
    platform: { image: 'linkedin', video: 'linkedin' },
    caption: [1000, 1800],
    captionField: 'caption',
    graphic: { cover_title: 50, cover_subtext: 30 },
  },
  instagram: {
    label: 'Instagram',
    platform: { image: 'instagram_feed', video: 'instagram_reels' },
    caption: [400, 700],
    captionField: 'caption',
    graphic: { graphic_quote: 150, graphic_label: 25 },
  },
  twitter: {
    label: 'X / Twitter',
    platform: { image: 'x', video: 'x' },
    caption: [200, 280],
    captionField: 'caption',
    graphic: { graphic_quote: 100 },
  },
  facebook: {
    label: 'Facebook',
    platform: { image: 'facebook', video: 'facebook' },
    caption: [400, 800],
    captionField: 'caption',
    graphic: { graphic_quote: 150 },
  },
  pinterest: {
    label: 'Pinterest',
    platform: { image: 'pinterest', video: 'pinterest' },
    caption: [300, 700],
    captionField: 'description',
    graphic: { graphic_title: 60, graphic_points: 100 },
  },
  threads: {
    label: 'Threads',
    platform: { image: 'threads', video: 'threads' },
    caption: [250, 500],
    captionField: 'caption',
  },
  reels_tiktok: {
    label: 'Reels / TikTok',
    platform: { image: 'tiktok', video: 'tiktok' },
    caption: [100, 150],
    captionField: 'caption',
  },
};

export interface FlatPost {
  channel: Channel;
  slot: PostSlot;
  post: Post;
}

/** Every post in prompt order: 4 per standard channel, 1 carousel, 3 reels/TikTok (28). */
export function flattenPosts(c: Captions, only?: Channel): FlatPost[] {
  const out: FlatPost[] = [];
  for (const channel of CHANNELS) {
    if (only && channel !== only) continue;
    const group = c[channel] as Partial<Record<PostSlot, Post>>;
    for (const slot of ['image', 'video_1', 'video_2', 'video_3'] as const) {
      const post = group[slot];
      if (post) out.push({ channel, slot, post });
    }
  }
  return out;
}

export const postText = (channel: Channel, p: Post): string =>
  (CHANNEL_SPECS[channel].captionField === 'description' ? p.description : p.caption) ??
  p.caption ??
  p.description ??
  '';

/** The text shown on the image: quote, Pinterest title or carousel cover. */
export const graphicText = (p: Post): string | null =>
  p.graphic_quote ?? p.graphic_title ?? p.cover_title ?? null;

const EM_DASH = /—|--/;

/** One post against the prompt's rules. */
export function postWarnings(channel: Channel, p: Post): string[] {
  const out: string[] = [];
  const spec = CHANNEL_SPECS[channel];
  const text = postText(channel, p);
  const [min, max] = spec.caption;
  const field = spec.captionField;
  if (!text.trim()) out.push(`Missing ${field}`);
  else if (text.length < min || text.length > max)
    out.push(`${field} is ${text.length} characters (target ${min}–${max})`);

  for (const [key, limit] of Object.entries(spec.graphic ?? {})) {
    const v = p[key as keyof Post];
    if (typeof v === 'string' && v.length > limit!)
      out.push(`${key} is ${v.length} characters (max ${limit})`);
  }
  if (channel === 'linkedin_carousel') {
    const slides = p.slides ?? [];
    if (slides.length < 4 || slides.length > 5)
      out.push(`${slides.length} carousel slides (4–5 recommended)`);
    slides.forEach((s, i) => {
      if (s.headline.length > 40)
        out.push(`Slide ${i + 1} headline is ${s.headline.length} characters (max 40)`);
      if (s.body.length > 200)
        out.push(`Slide ${i + 1} body is ${s.body.length} characters (max 200)`);
    });
  }

  const tags = p.hashtags.trim().split(/\s+/).filter(Boolean);
  if (tags.length !== 3) out.push(`${tags.length} hashtags (exactly 3 required)`);
  if (/,/.test(p.hashtags)) out.push('Hashtags are comma-separated (single spaces required)');
  if (tags[0] !== '#TrueUai') out.push('The first hashtag must be #TrueUai');
  if (new Set(tags.map((t) => t.toLowerCase())).size !== tags.length)
    out.push('Duplicate hashtags');
  if (tags.some((t) => !/^#\w+$/.test(t))) out.push('A hashtag isn’t a single #word');

  const fields = [
    text,
    graphicText(p) ?? '',
    p.graphic_label ?? '',
    p.cover_subtext ?? '',
    ...(p.slides ?? []).flatMap((s) => [s.headline, s.body]),
  ];
  if (fields.some((f) => /(^|\s)#\w/.test(f)))
    out.push('A hashtag appears inside the caption or graphic text');
  if (fields.some((f) => EM_DASH.test(f))) out.push('Contains an em dash');
  const forbidden = [
    ...new Set(
      fields
        .join(' ')
        .match(/\b(assistant|tools?|chatbots?|AI helper)\b/gi)
        ?.map((w) => w.toLowerCase()) ?? [],
    ),
  ];
  if (forbidden.length) out.push(`Forbidden terms (check context): ${forbidden.join(', ')}`);
  return out;
}

/** Set-level rules: #ThinkingPartner in roughly 80% of posts. */
export function setWarnings(c: Captions): string[] {
  const posts = flattenPosts(c);
  const share =
    posts.filter((x) => /#ThinkingPartner\b/.test(x.post.hashtags)).length /
    Math.max(1, posts.length);
  return share < 0.65 || share > 0.95
    ? [`#ThinkingPartner is in ${Math.round(share * 100)}% of posts (about 80% expected)`]
    : [];
}

/** The prompt's inputs, from the approved script and blog and the settings. */
export function captionInput(args: {
  topicTitle: string;
  category: string | null;
  script: Script | null;
  blog: Blog | null;
  urlTemplate: string;
  weeklyHashtags: string[];
}) {
  const slug = args.blog?.slug ?? '';
  const fallbackTags = (args.script?.youtube_optimization.hashtags ?? []).filter(
    (t) => !/^#(TrueU\.?ai|PrivateIntelligence|ThinkingPartner)$/i.test(t),
  );
  return {
    content_title: args.script?.episode_metadata.episode_title ?? args.topicTitle,
    content_type: 'video',
    topic_name: args.topicTitle,
    decision_domain: args.category || args.script?.episode_metadata.shared_value || '',
    key_message: [
      args.script?.opening_examples.connecting_statement,
      args.script?.closing_reflection,
    ]
      .filter(Boolean)
      .join(' '),
    content_url: args.urlTemplate.replace(/\{slug\}/g, slug),
    weekly_hashtags: args.weeklyHashtags.length ? args.weeklyHashtags : fallbackTags,
  };
}
