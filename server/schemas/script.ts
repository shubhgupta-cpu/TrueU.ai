// Output contract for script_generate: the client's "Storyboard Creation Prompt" v2.0 JSON
// (docs/prompts.md §3). Structure is enforced (a missing section fails and is retried once);
// the prompt's brand and length rules are checked as warnings (scriptWarnings) so a slightly-off
// response doesn't cost a second full generation.
import { z } from 'zod';

const text = z.string().trim().min(1);

const Scene = z.object({
  time_range: text,
  narration: text,
  on_screen_text: z.array(z.string()),
  b_roll: z.string(),
  narrator_background: z.string(),
  camera: z.string(),
  music: z.string(),
  emotional_beat: z.string(),
});

const CtaScene = z.object({
  time_range: text,
  narration: text,
  on_screen_text_progression: z.array(z.string()),
  narrator_background: z.string(),
  camera: z.string(),
  music: z.string(),
  emotional_beat: z.string(),
});

const Example = z.object({ perspective: text, story: text, shared_value_expression: z.string() });

const ShortClip = z.object({
  clip_id: z.number().int(),
  title: text,
  duration: z.string(),
  hook_content: text,
  platform_tease: text,
  cta: z.string(),
  visual: z.string(),
  music: z.string(),
  emotional_tone: z.string(),
});

export const Script = z.object({
  episode_metadata: z.object({
    topic: text,
    episode_title: text,
    shared_value: z.string(),
    total_runtime: z
      .object({ english: z.string(), other_languages: z.string() })
      .partial()
      .optional(),
  }),
  opening_examples: z.object({
    example_a: Example,
    example_b: Example,
    connecting_statement: z.string(),
  }),
  long_form_storyboard: z.object({
    scene_1: Scene,
    scene_2: Scene,
    scene_3: Scene,
    scene_4: Scene,
    scene_5: Scene,
    scene_6: Scene,
    scene_7_cta: CtaScene,
    scene_8_outro: z.object({
      time_range: z.string(),
      core_message: z.string(),
      note: z.string().optional(),
    }),
  }),
  narrator_backgrounds: z.array(
    z.object({
      scene: z.string(),
      description: z.string(),
      lighting: z.string(),
      emotional_alignment: z.string(),
    }),
  ),
  short_form_clips: z.array(ShortClip).length(6),
  youtube_optimization: z.object({
    title: text,
    description: text,
    tags: z.array(z.string()),
    hashtags: z.array(z.string()),
    thumbnail_concept: z.string(),
  }),
  closing_reflection: z.string(),
  clip_timestamps: z
    .array(
      z.object({
        clip_number: z.number().int(),
        timecode: text,
        hook_line: z.string(),
        scene_location: z.string(),
      }),
    )
    .length(3),
  transition_notes: z.string(),
});
export type Script = z.infer<typeof Script>;

export const SCENE_KEYS = [
  'scene_1',
  'scene_2',
  'scene_3',
  'scene_4',
  'scene_5',
  'scene_6',
] as const;
export const SCENE_NAMES = [
  'Opening Examples',
  'Context and Tension',
  'Emotional Root',
  'Bridge Questions',
  'Common-Ground Reframe',
  'Reflection Bridge to CTA',
  'Topic-Specific CTA',
  'Branded Outro',
] as const;

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** Every string in the output, with its path, for the brand-wide checks. */
function strings(v: unknown, path = ''): Array<[string, string]> {
  if (typeof v === 'string') return [[path, v]];
  if (Array.isArray(v)) return v.flatMap((x, i) => strings(x, `${path}[${i}]`));
  if (v && typeof v === 'object') {
    return Object.entries(v).flatMap(([k, x]) => strings(x, path ? `${path}.${k}` : k));
  }
  return [];
}

const FORBIDDEN: Array<[RegExp, string]> = [
  [/end[- ]to[- ]end|\bE2E\b/i, 'claims end-to-end encryption'],
  [/100% secure|completely secure/i, 'claims complete security'],
  [/\banonymous\b/i, 'claims anonymity'],
  [/can'?t read your data|cannot read your data/i, 'claims "we can\'t read your data"'],
  [/\bguarantee/i, 'promises an outcome ("guarantee")'],
  [/transform your life/i, 'promises an outcome ("transform your life")'],
  [/find out where you stand/i, 'uses verdict framing ("find out where you stand")'],
  [
    /\b(will tell you|get the answer|gives you clarity|you will discover)\b/i,
    'uses verdict framing',
  ],
  [/\b(keeping you up at night|anxious\?|struggling\?)/i, 'uses a distress hook'],
  [
    /\b(AI (assistant|journal|coach|helper)|chatbot|personal AI|mindfulness app)\b/i,
    'describes TrueU.ai with a forbidden term',
  ],
  [/NEDA\b/, 'names NEDA (use National Alliance for Eating Disorders)'],
];

/**
 * The prompt's own "final self-check", applied to the result. Returned as readable warnings that
 * the project page shows next to the script.
 */
export function scriptWarnings(s: Script): string[] {
  const out: string[] = [];
  const all = strings(s);

  const dashes = all.filter(([, v]) => /[—–]/.test(v)).map(([p]) => p);
  if (dashes.length)
    out.push(
      `Em/en dashes in ${dashes.length} field(s): ${dashes.slice(0, 5).join(', ')}${dashes.length > 5 ? '…' : ''}`,
    );

  const misspelt = all
    .filter(([, v]) => /\bTrue ?U\b(?!\.ai)|\btrueu\.ai\b|\bTru U\b/.test(v))
    .map(([p]) => p);
  if (misspelt.length)
    out.push(`Brand name not written as "TrueU.ai" in: ${misspelt.slice(0, 5).join(', ')}`);

  for (const [re, what] of FORBIDDEN) {
    const hit = all.find(([, v]) => re.test(v));
    if (hit) out.push(`${hit[0]} ${what}`);
  }

  const ctas: Array<[string, string]> = [
    ['Scene 7 CTA', s.long_form_storyboard.scene_7_cta.narration],
    ['YouTube description', s.youtube_optimization.description],
    ...s.short_form_clips.map((c): [string, string] => [
      `Clip ${c.clip_id} platform tease`,
      c.platform_tease,
    ]),
  ];
  for (const [name, v] of ctas) {
    if (!v.includes('Private Intelligence'))
      out.push(`${name} doesn't name "Private Intelligence"`);
  }
  if (!/thinking partner|private space/i.test(s.long_form_storyboard.scene_7_cta.narration)) {
    out.push('Scene 7 CTA doesn\'t say "thinking partner" or "private space"');
  }
  const ctaWords = words(s.long_form_storyboard.scene_7_cta.narration);
  if (ctaWords > 60) out.push(`Scene 7 CTA is ${ctaWords} words (target 40–55)`);

  SCENE_KEYS.forEach((k, i) => {
    const n = words(s.long_form_storyboard[k].narration);
    if (n < 130 || n > 230) out.push(`Scene ${i + 1} narration is ${n} words (target 150–200)`);
    for (const line of s.long_form_storyboard[k].on_screen_text) {
      if (line.length > 60) out.push(`Scene ${i + 1} on-screen text over 60 characters: "${line}"`);
    }
  });
  if (s.youtube_optimization.title.length > 60) {
    out.push(`YouTube title is ${s.youtube_optimization.title.length} characters (max 60)`);
  }
  return out;
}
