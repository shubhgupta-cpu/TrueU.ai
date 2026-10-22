// Output contract for blog_generate: the client's "TrueU.ai Blog Post Generator" v1.0 JSON
// (docs/prompts.md §2.3). Structure is enforced (retry once); the prompt's validation checklist is
// applied as warnings (blogWarnings) shown next to the blog.
import { z } from 'zod';
import type { Script } from './script.js';

const text = z.string().trim().min(1);
const Link = z.union([z.string(), z.record(z.unknown())]);

export const Blog = z.object({
  /** The prompt asks for "Category: …" on its own line above the JSON; the app also accepts it here. */
  category: z.string().optional(),
  title: text,
  meta_description: text,
  slug: text,
  primary_keyword: z.string(),
  word_count: z.coerce.number().optional(),
  content: z.object({
    introduction: text,
    sections: z
      .array(z.object({ h2: text, content: text, word_count: z.coerce.number().optional() }))
      .min(2)
      .max(6),
    trueu_section: z.object({ h2: text, content: text, cta_text: z.string().optional() }),
    conclusion: text,
    cta_box: z.object({
      headline: text,
      body: text,
      button_text: z.string(),
      button_url: z.string(),
    }),
  }),
  seo: z.object({
    internal_links: z.array(Link).default([]),
    external_links: z.array(Link).default([]),
    featured_image_suggestion: z.string().default(''),
  }),
  brand_checklist: z.record(z.unknown()).optional(),
});
export type Blog = z.infer<typeof Blog>;

export const BLOG_CATEGORIES = [
  'Clarity vs. Information',
  'Decision Architecture',
  'Belief Mapping',
  'Values Under Pressure',
  'Identity in Transition',
  'The Cost of Consensus',
  "The Reliable Person's Dilemma",
  'AI & Self',
  'Work & Meaning',
  'Thinking in Public',
  'The Long Game',
] as const;

/** "Category: Work & Meaning" on a line before the JSON, or the `category` field. */
export function blogCategory(blog: Blog, raw: string): string | null {
  const fromField = blog.category?.replace(/^Category:\s*/i, '').trim();
  if (fromField) return fromField;
  return raw.match(/^\s*Category:\s*(.+?)\s*$/im)?.[1] ?? null;
}

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** Section order for documents: the TrueU.ai section goes after 2–3 body sections (prompt §5). */
export function blogSections(b: Blog): Array<{ h2: string; content: string; trueu?: boolean }> {
  const body = b.content.sections.map((s) => ({ h2: s.h2, content: s.content }));
  const at = Math.min(3, Math.max(2, body.length - 1));
  return [
    ...body.slice(0, at),
    { h2: b.content.trueu_section.h2, content: b.content.trueu_section.content, trueu: true },
    ...body.slice(at),
  ];
}

export function blogWordCount(b: Blog): number {
  return words(
    [b.content.introduction, ...blogSections(b).map((s) => s.content), b.content.conclusion].join(
      ' ',
    ),
  );
}

/** The prompt's validation checklist, applied to the result. */
export function blogWarnings(b: Blog, raw = ''): string[] {
  const out: string[] = [];
  const allText = [
    b.title,
    b.meta_description,
    b.content.introduction,
    ...blogSections(b).flatMap((s) => [s.h2, s.content]),
    b.content.conclusion,
    b.content.cta_box.headline,
    b.content.cta_box.body,
  ].join('\n');

  if (b.title.length < 50 || b.title.length > 60)
    out.push(`Title is ${b.title.length} characters (target 50–60)`);
  if (b.meta_description.length < 150 || b.meta_description.length > 160) {
    out.push(`Meta description is ${b.meta_description.length} characters (target 150–160)`);
  }
  const kw = b.primary_keyword.trim().toLowerCase();
  if (kw && !b.title.toLowerCase().includes(kw))
    out.push('Title doesn’t include the primary keyword');
  if (kw && !b.meta_description.toLowerCase().includes(kw))
    out.push('Meta description doesn’t include the primary keyword');

  const total = blogWordCount(b);
  if (total < 1500 || total > 2000) out.push(`Blog is ${total} words (target 1,500–2,000)`);
  const n = b.content.sections.length;
  if (n < 3 || n > 5) out.push(`${n} body sections (target 3–5)`);

  if (/TrueU\.ai/i.test(b.content.introduction))
    out.push('The introduction mentions TrueU.ai (it shouldn’t)');
  const mentions = (allText.match(/TrueU\.ai/g) ?? []).length;
  if (mentions < 2 || mentions > 3)
    out.push(`TrueU.ai is mentioned ${mentions} times in the article (target 2–3)`);
  if (/\bTrue ?U\b(?!\.ai)|\btrueu\.ai\b/.test(allText))
    out.push('Brand name not always written as "TrueU.ai"');
  if (!/Thinking Partner/.test(allText)) out.push('The exact phrase "Thinking Partner" is missing');

  const evolution = (
    allText.match(
      /learns how you think|adapts to your thinking style|evolves to understand what clarity means for you/gi,
    ) ?? []
  ).length;
  if (evolution !== 1)
    out.push(`Evolution message appears ${evolution} times (exactly once expected)`);

  const forbidden = [
    ...new Set(
      (allText.match(/\b(assistant|tools?|chatbots?|advisors?|coach(?:es|ing)?)\b/gi) ?? []).map(
        (w) => w.toLowerCase(),
      ),
    ),
  ];
  if (forbidden.length) out.push(`Forbidden terms used (check context): ${forbidden.join(', ')}`);
  const hype = [
    ...new Set(
      (allText.match(/\b(amazing|revolutionary|game-changing|game changer)\b/gi) ?? []).map((w) =>
        w.toLowerCase(),
      ),
    ),
  ];
  if (hype.length) out.push(`Hype language: ${hype.join(', ')}`);
  if (/\byou should\b/i.test(allText)) out.push('Uses prescriptive "you should"');

  if (!raw.match(/^\s*Category:/im) && !b.category) out.push('No category was chosen');
  return out;
}

/** {{script_summary}}: the approved script's story, without production notes (clips, camera, B-roll). */
export function scriptSummary(s: Script): string {
  const lf = s.long_form_storyboard;
  const o = s.opening_examples;
  const scenes = (['scene_1', 'scene_2', 'scene_3', 'scene_4', 'scene_5', 'scene_6'] as const).map(
    (k, i) => `Scene ${i + 1}: ${lf[k].narration}`,
  );
  return [
    `Episode: ${s.episode_metadata.episode_title}`,
    `Topic: ${s.episode_metadata.topic}`,
    `Shared value: ${s.episode_metadata.shared_value}`,
    `Example A (${o.example_a.perspective}): ${o.example_a.story}`,
    `Example B (${o.example_b.perspective}): ${o.example_b.story}`,
    o.connecting_statement,
    ...scenes,
    `Closing reflection: ${s.closing_reflection}`,
  ].join('\n\n');
}

/** Inputs the prompt names, from the topic, its score and the approved script. */
export function blogInput(args: {
  topicTitle: string;
  category: string | null;
  evaluation: Record<string, unknown>;
  script: Script | null;
}) {
  const ev = args.evaluation as {
    criteria_scores?: { search_intent?: { search_phrases?: unknown; reasoning?: unknown } };
  };
  const phrases = Array.isArray(ev.criteria_scores?.search_intent?.search_phrases)
    ? (ev.criteria_scores!.search_intent!.search_phrases as unknown[]).filter(
        (p): p is string => typeof p === 'string',
      )
    : [];
  const tags = args.script?.youtube_optimization.tags ?? [];
  const secondary = [
    ...new Set([...phrases.slice(1), ...tags].map((s) => s.trim()).filter(Boolean)),
  ];
  return {
    topic_title: args.topicTitle,
    decision_domain: args.category || args.script?.episode_metadata.shared_value || '',
    script_summary: args.script ? scriptSummary(args.script) : '',
    primary_keyword: phrases[0] ?? args.topicTitle,
    secondary_keywords: secondary.join(', '),
    search_intent:
      typeof ev.criteria_scores?.search_intent?.reasoning === 'string'
        ? ev.criteria_scores.search_intent.reasoning
        : '',
  };
}
