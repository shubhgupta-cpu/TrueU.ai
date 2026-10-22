// Output contracts for the topic prompts (docs/prompts.md §2).
// topic_score / topic_regenerate follow the client's own JSON shape (TrueU Topic Validation v2.0 / v2.1).
import { z } from 'zod';

const Score = z.number().int().min(1).max(10);
const Improvements = z.array(z.string());

const CriteriaScores = z.object({
  search_intent: z.object({
    score: Score,
    reasoning: z.string(),
    search_phrases: z.array(z.string()),
    improvements: Improvements,
  }),
  personal_consequence: z.object({
    score: Score,
    reasoning: z.string(),
    improvements: Improvements,
  }),
  fear_curiosity: z.object({
    score: Score,
    fear_identified: z.string(),
    curiosity_gap: z.string(),
    improvements: Improvements,
  }),
  specific_person: z.object({
    score: Score,
    person_description: z.string(),
    improvements: Improvements,
  }),
  urgency: z.object({
    score: Score,
    reasoning: z.string(),
    deadline_check: z.string(),
    improvements: Improvements,
  }),
  platform_invitation: z.object({
    score: Score,
    reasoning: z.string(),
    first_conversation_test: z.string(),
    improvements: Improvements,
  }),
});

export const CRITERIA = [
  { key: 'search_intent', label: 'Search Intent Alignment' },
  { key: 'personal_consequence', label: 'Personal Consequence' },
  { key: 'fear_curiosity', label: 'Fear + Curiosity Hook' },
  { key: 'specific_person', label: 'Specific Person Targeting' },
  { key: 'urgency', label: 'Urgency / Timing' },
  { key: 'platform_invitation', label: 'Platform Invitation' },
] as const;
export type CriterionKey = (typeof CRITERIA)[number]['key'];
export const CRITERION_MAX = 10;

const evaluationFields = {
  topic: z.string().trim().min(3),
  criteria_scores: CriteriaScores,
  total_score: z.number().int().min(6).max(60),
  score_breakdown: z.object({
    search_intent: z.number().int(),
    personal_consequence: z.number().int(),
    fear_curiosity: z.number().int(),
    specific_person: z.number().int(),
    urgency: z.number().int(),
    platform_invitation: z.number().int(),
  }),
  recommendation: z.enum(['GREENLIGHT', 'REFINE', 'REJECT']),
  trigger_moment: z.string(),
  icp_alignment: z.enum(['Strong', 'Moderate', 'Weak']),
  icp_alignment_notes: z.string(),
  top_improvements: Improvements,
  storyboard: z.object({
    topic: z.string(),
    episode_title: z.string(),
    shared_value: z.string(),
    side_a_cares_about: z.string(),
    side_b_cares_about: z.string(),
    shared_deeper_need: z.string(),
  }),
  summary: z.string(),
};

type EvaluationShape = z.infer<z.ZodObject<typeof evaluationFields>>;

/** Hard rules: a wrong total corrupts scoring, so it fails validation and triggers the retry. */
function checkTotals(ev: EvaluationShape, ctx: z.RefinementCtx) {
  const sum = CRITERIA.reduce((acc, c) => acc + ev.criteria_scores[c.key].score, 0);
  if (ev.total_score !== sum) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['evaluation', 'total_score'],
      message: `total_score is ${ev.total_score} but the six criterion scores sum to ${sum}`,
    });
  }
  for (const c of CRITERIA) {
    if (ev.score_breakdown[c.key] !== ev.criteria_scores[c.key].score) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['evaluation', 'score_breakdown', c.key],
        message: `score_breakdown.${c.key} must equal criteria_scores.${c.key}.score`,
      });
    }
  }
}

const EVALUATION_KEYS = [...Object.keys(evaluationFields), 'original_topic', 'regeneration_notes'];

/**
 * Smaller models sometimes close "evaluation" one brace early, leaving its remaining fields at the
 * top level. Move them back inside (only keys the evaluation lacks); no wording changes, and the
 * schema and the totals check still run on the result.
 */
export function regroupEvaluation(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const obj = raw as Record<string, unknown>;
  const ev = obj.evaluation;
  if (!ev || typeof ev !== 'object' || Array.isArray(ev)) return raw;
  const stray = EVALUATION_KEYS.filter((k) => k in obj && !(k in (ev as object)));
  if (!stray.length) return raw;
  const out: Record<string, unknown> = { ...obj, evaluation: { ...(ev as object) } };
  for (const k of stray) {
    (out.evaluation as Record<string, unknown>)[k] = obj[k];
    delete out[k];
  }
  return out;
}

export const TopicEvaluation = z.preprocess(
  regroupEvaluation,
  z
    .object({ evaluation: z.object(evaluationFields) })
    .superRefine((v, ctx) => checkTotals(v.evaluation, ctx)),
);
export type TopicEvaluation = z.infer<typeof TopicEvaluation>;

/** Topic titles the app creates (rewrites, Claude and trend topics): 5–6 words, 8 at most. */
export const MAX_TITLE_WORDS = 8;
export const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

const ShortTitle = z
  .string()
  .trim()
  .min(3)
  .max(120)
  .describe('A short topic title: 5 to 6 words, never more than 8 words.')
  .refine(
    (t) => wordCount(t) <= MAX_TITLE_WORDS,
    (t) => ({
      message: `must be ${MAX_TITLE_WORDS} words or fewer (5–6 is ideal); "${t}" has ${wordCount(t)} words. Shorten it, keeping the core decision`,
    }),
  );

export const TopicRegeneration = z.preprocess(
  regroupEvaluation,
  z
    .object({
      evaluation: z.object({
        ...evaluationFields,
        original_topic: z.string(),
        // The rewritten topic becomes the new topic's title.
        topic: ShortTitle,
        regeneration_notes: z.string(),
      }),
    })
    .superRefine((v, ctx) => checkTotals(v.evaluation, ctx)),
);
export type TopicRegeneration = z.infer<typeof TopicRegeneration>;

const TopicIdea = z.object({
  title: ShortTitle,
  description: z.string(),
  category: z.string(),
  angle: z.string(),
});

export const GeneratedTopics = z.object({ topics: z.array(TopicIdea).min(1) });

const str = z.string().default('');

/** topic_generate: the client's "TrueU Monthly Content Strategy Agent" (10 ranked topics a month). */
export const MonthlyTopics = z.object({
  month: str,
  trend_data_used: z.boolean().optional(),
  trend_query_sent: str,
  trend_signals_used: z.array(z.string()).default([]),
  seasonal_context_applied: str,
  ai_cap_check: z.record(z.unknown()).optional(),
  topics: z
    .array(
      z.object({
        rank: z.coerce.number().optional(),
        source: z.string().default('NEW'),
        trigger_moment: str,
        topic_short: ShortTitle,
        episode_title: z.string().trim().min(3),
        shared_value: str,
        scores: z.record(z.unknown()).optional(),
        why_scores_high: str,
        search_intent_phrase: str,
        trend_evidence: str,
        first_conversation_prompt: str,
        fear_hook: str,
        curiosity_gap: str,
        notes: str,
      }),
    )
    .min(1)
    .max(12),
  recommended_top_4: z
    .object({
      ranks: z.array(z.coerce.number()).default([]),
      rationale: str,
      production_order: z.array(z.record(z.unknown())).default([]),
    })
    .optional(),
  monthly_mix_analysis: z.record(z.unknown()).optional(),
});
export type MonthlyTopics = z.infer<typeof MonthlyTopics>;
export const TrendTopics = z.object({
  topics: z.array(TopicIdea.extend({ trend_reason: z.string() })).max(3),
});

// ---------------------------------------------------------------------------
// Normalisation + soft checks
// ---------------------------------------------------------------------------

export interface CriterionRow {
  key: CriterionKey;
  label: string;
  score: number;
  max: number;
  reasoning: string;
  improvements: string[];
  details: Record<string, string | string[]>;
}

/** topic_scores.criteria: one row per criterion, in rubric order, ready for the score bars. */
export function toCriteria(ev: EvaluationShape): CriterionRow[] {
  const s = ev.criteria_scores;
  const reasoning: Record<CriterionKey, string> = {
    search_intent: s.search_intent.reasoning,
    personal_consequence: s.personal_consequence.reasoning,
    fear_curiosity: [s.fear_curiosity.fear_identified, s.fear_curiosity.curiosity_gap]
      .filter(Boolean)
      .join(' '),
    specific_person: s.specific_person.person_description,
    urgency: s.urgency.reasoning,
    platform_invitation: s.platform_invitation.reasoning,
  };
  return CRITERIA.map(({ key, label }) => {
    const { score, improvements, ...rest } = s[key] as unknown as {
      score: number;
      improvements: string[];
    } & Record<string, string | string[]>;
    const details = Object.fromEntries(
      Object.entries(rest).filter(([k]) => k !== 'reasoning'),
    ) as Record<string, string | string[]>;
    return {
      key,
      label,
      score,
      max: CRITERION_MAX,
      reasoning: reasoning[key],
      improvements,
      details,
    };
  });
}

const PTS = /\+\s*(\d+)\s*pts?\.?\s*$/i;

/**
 * Format rules from the client's prompt that are checked but don't fail the job: they're shown as
 * warnings next to the score so a slightly-off response doesn't burn a retry.
 */
export function evaluationWarnings(ev: EvaluationShape, passMark: number): string[] {
  const warnings: string[] = [];
  const s = ev.criteria_scores;
  if (s.search_intent.search_phrases.length !== 3) {
    warnings.push(`search_phrases has ${s.search_intent.search_phrases.length} items (expected 3)`);
  }
  for (const { key, label } of CRITERIA) {
    const c = s[key];
    let uplift = 0;
    for (const imp of c.improvements) {
      const m = imp.match(PTS);
      if (!m) warnings.push(`${label}: improvement doesn't end with "+X pts": "${imp}"`);
      else uplift += Number(m[1]);
    }
    if (uplift > CRITERION_MAX - c.score) {
      warnings.push(
        `${label}: improvements claim +${uplift} pts but the gap to ${CRITERION_MAX} is ${CRITERION_MAX - c.score}`,
      );
    }
  }
  for (const imp of ev.top_improvements) {
    if (!PTS.test(imp)) warnings.push(`Top improvement doesn't end with "+X pts": "${imp}"`);
  }
  const storyboardFilled = Object.values(ev.storyboard).some((v) => v.trim() !== '');
  if (ev.total_score >= passMark && !storyboardFilled)
    warnings.push('storyboard is empty for a passing score');
  if (ev.total_score < passMark && storyboardFilled)
    warnings.push('storyboard is filled for a score below the pass mark');
  if (storyboardFilled && /\s/.test(ev.storyboard.shared_value.trim())) {
    warnings.push(`storyboard.shared_value should be one word: "${ev.storyboard.shared_value}"`);
  }
  if (/\b\d{2}\s*(?:years?\s*old|yo)\b/i.test(s.specific_person.person_description)) {
    warnings.push('person_description mentions an age');
  }
  return warnings;
}

/** Every improvement the evaluation suggested, for the regeneration prompt's prior_improvements. */
export function collectImprovements(ev: EvaluationShape): string[] {
  return [
    ...ev.top_improvements,
    ...CRITERIA.flatMap(({ key, label }) =>
      ev.criteria_scores[key].improvements.map((imp) => `${label}: ${imp}`),
    ),
  ].filter((s) => s.trim() !== '');
}
