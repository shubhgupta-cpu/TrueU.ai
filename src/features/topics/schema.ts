import { z } from 'zod';

// Submit topic form (F2.1). The server re-validates in submit-topic.
export const submitTopicSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, 'Enter a title of at least 3 characters')
    .max(120, 'Keep the title to 120 characters or fewer'),
  description: z.string().trim().max(2000).optional(),
  category: z.string().optional(),
  notes: z.string().trim().max(2000).optional(),
});
export type SubmitTopicValues = z.infer<typeof submitTopicSchema>;

export const editTopicSchema = z.object({
  title: z.string().trim().min(3, 'Enter a title of at least 3 characters').max(200),
  description: z.string().trim().max(2000).optional(),
});
export type EditTopicValues = z.infer<typeof editTopicSchema>;

// ---- Stored score shapes (written by the score_topic job; see server/schemas/topics.ts)

export const criterionRowSchema = z.object({
  key: z.string(),
  label: z.string(),
  score: z.number(),
  max: z.number(),
  reasoning: z.string().default(''),
  improvements: z.array(z.string()).default([]),
  details: z.record(z.union([z.string(), z.array(z.string())])).default({}),
});
export type CriterionRow = z.infer<typeof criterionRowSchema>;

export const storyboardSchema = z
  .object({
    topic: z.string(),
    episode_title: z.string(),
    shared_value: z.string(),
    side_a_cares_about: z.string(),
    side_b_cares_about: z.string(),
    shared_deeper_need: z.string(),
  })
  .partial();

/** The fields of the client's evaluation the Inbox shows. Lenient: older rows may lack some. */
export const evaluationViewSchema = z
  .object({
    recommendation: z.string(),
    trigger_moment: z.string(),
    icp_alignment: z.string(),
    icp_alignment_notes: z.string(),
    top_improvements: z.array(z.string()),
    storyboard: storyboardSchema,
    summary: z.string(),
  })
  .partial();
export type EvaluationView = z.infer<typeof evaluationViewSchema>;

export function parseCriteria(raw: unknown): CriterionRow[] {
  const parsed = z.array(criterionRowSchema).safeParse(raw);
  return parsed.success ? parsed.data : [];
}

export function parseEvaluation(raw: unknown): EvaluationView {
  const parsed = evaluationViewSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : {};
}

export const trendItemSchema = z.object({
  engine: z.string(),
  query: z.string(),
  value: z.string().optional(),
  url: z.string().optional(),
});

export const sourceDetailSchema = z
  .object({
    keyword: z.string(),
    angle: z.string(),
    trend_reason: z.string(),
    items: z.array(trendItemSchema),
    fetched_at: z.string(),
    regenerated_from_topic: z.number(),
  })
  .partial();
export type SourceDetail = z.infer<typeof sourceDetailSchema>;

export function parseSourceDetail(raw: unknown): SourceDetail {
  const parsed = sourceDetailSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : {};
}
