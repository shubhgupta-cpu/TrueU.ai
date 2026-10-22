// Topic jobs: score_topic, regenerate_topic, generate_topics, pull_trends (architecture.md §6.1).
import { z } from 'zod';
import type { Topic } from '../../src/types/api.js';
import { createOne, eq, first, list, nowIso, T, toJson, updateOne } from '../airtable.js';
import { runPrompt, type RunPromptResult } from '../claude.js';
import { activity } from '../log.js';
import { insertTopics, loadTopic, setTopicStatus } from '../repo/topics.js';
import {
  collectImprovements,
  evaluationWarnings,
  MonthlyTopics,
  toCriteria,
  TopicEvaluation,
  TopicRegeneration,
  TrendTopics,
} from '../schemas/topics.js';
import { collectTrends, googleTrendsOnce } from '../serp.js';
import { env, isMock } from '../env.js';
import { getSettings } from '../settings.js';
import { formatImprovements, isScorable, localDate, topicText } from '../topics.js';
import type { JobHandler } from './handlers.js';
import { enqueue, DuplicateJobError } from './queue.js';
import { PermanentJobError } from './rules.js';

const TopicPayload = z.object({ topic_id: z.string().min(1) });

export function payload<T>(schema: z.ZodType<T>, raw: unknown): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new PermanentJobError(`Invalid job payload: ${parsed.error.message}`);
  return parsed.data;
}

async function mustLoadTopic(id: string): Promise<Topic> {
  const topic = await loadTopic(id);
  if (!topic) throw new PermanentJobError(`Topic ${id} not found`);
  return topic;
}

function promptVars(topic: Topic, timezone: string) {
  return {
    topic: topicText(topic),
    topic_json: {
      title: topic.title,
      description: topic.description,
      category: topic.category,
      source: topic.source,
      source_detail: topic.source_detail,
    },
    current_date: localDate(new Date(), timezone),
  };
}

type Evaluation = z.infer<typeof TopicEvaluation>['evaluation'];

/** Writes the Topic Scores record and moves the topic to qualified / needs_work. */
async function recordScore(
  topic: Topic,
  ev: Evaluation,
  run: RunPromptResult<unknown>,
  scoredText: string,
) {
  const { score_threshold, score_max } = await getSettings([
    'score_threshold',
    'score_max',
  ] as const);
  const passed = ev.total_score >= score_threshold;

  const score = await createOne(T.topicScores, {
    Name: `#${topic.topic_number} · ${ev.total_score}/${score_max}`,
    Topic: [topic.id],
    Total: ev.total_score,
    'Max Total': score_max,
    Passed: passed,
    Threshold: score_threshold,
    Recommendation: ev.recommendation,
    Criteria: toJson(toCriteria(ev)),
    Evaluation: toJson(ev),
    Summary: ev.summary,
    'Improvement Suggestions': ev.top_improvements.join('\n') || undefined,
    'Scored Topic Text': scoredText,
    Warnings: toJson(evaluationWarnings(ev, score_threshold)),
    'Prompt Key': run.prompt.key,
    'Prompt Version': run.prompt.version,
    Model: run.model,
    Created: nowIso(),
  });

  // Rescoring a selected / saved / rejected topic records the score but keeps the owner's decision.
  const current = await mustLoadTopic(topic.id);
  const fields = {
    'Score Total': ev.total_score,
    'Score Max': score_max,
    'Latest Score': [score.id],
    'Last Error': null,
  };
  if (isScorable(current.status)) {
    await setTopicStatus(current, passed ? 'qualified' : 'needs_work', fields);
  } else {
    await updateOne(T.topics, topic.id, { ...fields, Updated: nowIso() });
  }
  await activity({
    event: 'topic_scored',
    topicId: topic.id,
    details: { total: ev.total_score, passed, threshold: score_threshold, score_id: score.id },
  });
  return { scoreId: score.id, passed };
}

export const scoreTopic: JobHandler = {
  async run(job) {
    const { topic_id } = payload(TopicPayload, job.payload);
    const topic = await mustLoadTopic(topic_id);
    const settings = await getSettings(['timezone', 'auto_regenerate_topics'] as const);

    if (isScorable(topic.status) && topic.status !== 'scoring') {
      await updateOne(T.topics, topic.id, { Status: 'scoring', Updated: nowIso() });
    }

    const run = await runPrompt(
      'topic_score',
      promptVars(topic, settings.timezone),
      TopicEvaluation,
      {
        jobId: job.id,
      },
    );
    const ev = run.data.evaluation;
    const { scoreId, passed } = await recordScore(topic, ev, run, topicText(topic));

    // Below the pass mark: rewrite once with the suggestions (regenerated topics are never rewritten).
    let regenerationQueued = false;
    if (
      !passed &&
      settings.auto_regenerate_topics &&
      !topic.regenerated_from &&
      collectImprovements(ev).length
    ) {
      if (!(await regenerationOf(topic))) {
        try {
          await enqueue(
            'regenerate_topic',
            { topic_id: topic.id, score_id: scoreId },
            { dedupeKey: `regenerate_topic:${topic.id}`, maxAttempts: 2 },
          );
          regenerationQueued = true;
        } catch (err) {
          if (!(err instanceof DuplicateJobError)) throw err; // already pending: fine
        }
      }
    }
    return {
      score_id: scoreId,
      total: ev.total_score,
      passed,
      regeneration_queued: regenerationQueued,
    };
  },

  // F3.5: after the last failed attempt the topic shows an error with a Retry button.
  async onFailed(job, message) {
    const parsed = TopicPayload.safeParse(job.payload);
    if (!parsed.success) return;
    const topic = await loadTopic(parsed.data.topic_id);
    if (topic && (topic.status === 'new' || topic.status === 'scoring')) {
      await setTopicStatus(topic, 'error', { 'Last Error': `Scoring failed: ${message}` });
    }
  },
};

/** The topic's improved version, if it was already regenerated (at most once per topic). */
async function regenerationOf(original: Topic): Promise<string | null> {
  const rows = await list(T.topics, {
    filterByFormula: `{Regenerated From}!=""`,
    fields: ['Regenerated From'],
  });
  const hit = rows.find((r) =>
    (r.fields['Regenerated From'] as string[] | undefined)?.includes(original.id),
  );
  return hit?.id ?? null;
}

/** `manual`: the owner pressed "Regenerate from suggestions" — any number of times, any topic. */
const RegeneratePayload = TopicPayload.extend({ manual: z.boolean().optional() });

export const regenerateTopic: JobHandler = {
  async run(job) {
    const { topic_id, manual } = payload(RegeneratePayload, job.payload);
    const original = await mustLoadTopic(topic_id);
    // The automatic rewrite (F3.6) runs once per original topic; manual ones aren't limited.
    if (!manual) {
      if (original.regenerated_from)
        return { skipped: 'regenerated topics are not regenerated again' };
      const existing = await regenerationOf(original);
      if (existing) return { skipped: 'already regenerated', topic_id: existing };
    }

    const latest = original.latest_score_id
      ? await first(T.topicScores, {
          filterByFormula: `RECORD_ID()=${JSON.stringify(original.latest_score_id)}`,
        })
      : null;
    const evaluationJson = latest?.fields['Evaluation'];
    let improvements: string[] = [];
    if (typeof evaluationJson === 'string') {
      try {
        const prior = TopicEvaluation.safeParse({ evaluation: JSON.parse(evaluationJson) });
        if (prior.success) improvements = collectImprovements(prior.data.evaluation);
      } catch {
        // unreadable evaluation: nothing to apply
      }
    }
    if (!improvements.length) {
      if (manual)
        throw new PermanentJobError(
          'The latest score has no suggestions to apply. Rescore the topic first.',
        );
      return { skipped: 'no improvements to apply' };
    }

    const { timezone } = await getSettings(['timezone'] as const);
    const run = await runPrompt(
      'topic_regenerate',
      { ...promptVars(original, timezone), prior_improvements: formatImprovements(improvements) },
      TopicRegeneration,
      { jobId: job.id },
    );
    const ev = run.data.evaluation;

    // Inserted as 'scoring' (no separate score job): this same response carries its score.
    const [created] = await insertTopics([
      {
        title: ev.topic,
        category: original.category,
        source: original.source,
        source_detail: {
          ...(original.source_detail as Record<string, unknown>),
          regenerated_from_topic: original.topic_number,
        },
        status: 'scoring',
        regenerated_from: original.id,
        regeneration_notes: ev.regeneration_notes,
      },
    ]);
    const { scoreId, passed } = await recordScore(created!, ev, run, ev.topic);
    await activity({
      event: 'topic_regenerated',
      topicId: original.id,
      details: { new_topic_id: created!.id, total: ev.total_score, passed, manual: !!manual },
    });
    return { topic_id: created!.id, score_id: scoreId, total: ev.total_score, passed };
  },
};

const GeneratePayload = z.object({ count: z.number().int().min(1).max(50).optional() });

/**
 * "Generate with Claude" / the monthly cron: the client's Monthly Content Strategy Agent. The app
 * makes the prompt's single Google Trends call (Claude can't call tools here) and passes the
 * result in; the agent returns 10 ranked topics. Each becomes a topic titled with its 2–6 word
 * topic_short (the episode title is the description) and is scored like every other topic.
 */
export const generateTopics: JobHandler = {
  async run(job) {
    payload(GeneratePayload, job.payload);
    const { timezone, monthly_trend_query } = await getSettings([
      'timezone',
      'monthly_trend_query',
    ] as const);
    const now = new Date();
    const month = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      month: 'long',
      year: 'numeric',
    }).format(now);
    const sixMonthsAgo = Date.now() - 183 * 86_400_000;

    const all = await list(T.topics, { fields: ['Title', 'Description', 'Status', 'Created'] });
    const recent = all
      .filter(
        (r) =>
          Date.parse((r.fields['Created'] as string | undefined) ?? r.createdTime) >= sixMonthsAgo,
      )
      .slice(0, 200)
      .map((r) => r.fields['Title'] as string);
    const saved = all
      .filter((r) => r.fields['Status'] === 'saved')
      .slice(0, 50)
      .map((r) => ({ title: r.fields['Title'], description: r.fields['Description'] ?? null }));

    const trends = await googleTrendsOnce(monthly_trend_query, job.id);
    const run = await runPrompt(
      'topic_generate',
      {
        month,
        current_date: localDate(now, timezone),
        saved_topics: saved,
        recent_titles: recent,
        trend_query: monthly_trend_query,
        trend_data:
          trends ??
          'No data: Google Trends is not connected or returned nothing. Proceed with ICP + seasonal context and set "trend_data_used": false.',
      },
      MonthlyTopics,
      { jobId: job.id },
    );

    const recommended = new Set(run.data.recommended_top_4?.ranks ?? []);
    // SAVED entries are re-scores of topics already in the Inbox: don't add them twice.
    const fresh = run.data.topics.filter((t) => t.source.toUpperCase() !== 'SAVED');
    const created = await insertTopics(
      fresh.map((t) => ({
        title: t.topic_short,
        description: t.episode_title,
        category: null,
        source: 'claude' as const,
        source_detail: {
          angle: [t.trigger_moment, t.notes].filter(Boolean).join(': '),
          rank: t.rank ?? null,
          recommended: t.rank !== undefined && recommended.has(t.rank),
          trigger_moment: t.trigger_moment,
          episode_title: t.episode_title,
          shared_value: t.shared_value,
          strategy_scores: t.scores ?? null,
          why_scores_high: t.why_scores_high,
          search_intent_phrase: t.search_intent_phrase,
          trend_evidence: t.trend_evidence,
          first_conversation_prompt: t.first_conversation_prompt,
          fear_hook: t.fear_hook,
          curiosity_gap: t.curiosity_gap,
          month: run.data.month || month,
          trend_data_used: trends !== null && run.data.trend_data_used !== false,
          job_id: job.id,
        },
      })),
    );
    await activity({
      event: 'topics_generated',
      details: {
        count: created.length,
        skipped_saved: run.data.topics.length - fresh.length,
        month,
        trend_data_used: trends !== null,
        trend_signals_used: run.data.trend_signals_used,
        recommended_top_4: run.data.recommended_top_4 ?? null,
        job_id: job.id,
      },
    });
    return { inserted: created.length, trend_data_used: trends !== null, month };
  },
};

const TrendsPayload = z.object({ keywords: z.array(z.string().min(1)).optional() });

export const pullTrends: JobHandler = {
  async run(job) {
    const { keywords: requested } = payload(TrendsPayload, job.payload);
    const { max_trend_topics_per_run, timezone } = await getSettings([
      'max_trend_topics_per_run',
      'timezone',
    ] as const);

    let keywords = requested;
    if (!keywords?.length) {
      const rows = await list(T.seedKeywords, {
        filterByFormula: eq('Active', true),
        fields: ['Keyword'],
      });
      keywords = rows.map((r) => r.fields['Keyword'] as string).filter(Boolean);
    }
    if (!keywords.length) {
      throw new PermanentJobError(
        'No active seed keywords. Add some in Settings → Seed keywords, then pull trends again.',
      );
    }
    if (!isMock() && !env('SERPAPI_API_KEY')) {
      throw new PermanentJobError(
        'SerpAPI isn’t connected: add SERPAPI_API_KEY to the server settings (.env.local / Vercel).',
      );
    }

    const fetchedAt = nowIso();
    const failures: string[] = [];
    let inserted = 0;

    for (const keyword of keywords) {
      if (inserted >= max_trend_topics_per_run) break;
      try {
        const items = await collectTrends(keyword, job.id);
        if (!items.length) continue;
        const run = await runPrompt(
          'trend_to_topic',
          { keyword, trend_items: items, current_date: localDate(new Date(), timezone) },
          TrendTopics,
          { jobId: job.id },
        );
        const created = await insertTopics(
          run.data.topics.slice(0, max_trend_topics_per_run - inserted).map((t) => ({
            title: t.title,
            description: t.description || null,
            category: t.category || null,
            source: 'trending' as const,
            source_detail: {
              keyword,
              angle: t.angle,
              trend_reason: t.trend_reason,
              items: items.slice(0, 5),
              fetched_at: fetchedAt,
            },
          })),
        );
        inserted += created.length;
      } catch (err) {
        // One keyword failing shouldn't lose the others' topics.
        if (err instanceof PermanentJobError) throw err;
        failures.push(`${keyword}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (failures.length === keywords.length)
      throw new Error(`Every keyword failed. ${failures.join(' | ')}`);
    await activity({
      event: 'trends_pulled',
      details: { inserted, keywords, failures, job_id: job.id },
    });
    return { inserted, failures };
  },
};
