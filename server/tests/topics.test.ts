// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { costUsd, validateOutput } from '../claude.js';
import { claudeFixtures } from '../fixtures/index.js';
import {
  collectImprovements,
  evaluationWarnings,
  MonthlyTopics,
  toCriteria,
  TopicEvaluation,
  TopicRegeneration,
  TrendTopics,
  wordCount,
} from '../schemas/topics.js';
import { findDuplicate, localDate, similarity, topicText } from '../topics.js';

const [qualified, needsWork] = claudeFixtures.topic_score as [unknown, unknown];
const clone = <T>(v: T): T => structuredClone(v);

describe('topic evaluation schema', () => {
  it('accepts every Claude fixture', () => {
    for (const f of claudeFixtures.topic_score!)
      expect(TopicEvaluation.safeParse(f).success).toBe(true);
    expect(TopicRegeneration.safeParse(claudeFixtures.topic_regenerate![0]).success).toBe(true);
    expect(MonthlyTopics.safeParse(claudeFixtures.topic_generate![0]).success).toBe(true);
    expect(TrendTopics.safeParse(claudeFixtures.trend_to_topic![0]).success).toBe(true);
  });

  it('fails a total that does not match the criteria', () => {
    const bad = clone(qualified) as { evaluation: { total_score: number } };
    bad.evaluation.total_score = 55;
    const v = validateOutput(JSON.stringify(bad), TopicEvaluation);
    expect(v.ok).toBe(false);
    expect(!v.ok && v.error).toMatch(/total_score is 55 but the six criterion scores sum to 51/);
  });

  it('requires score_breakdown to mirror criteria_scores', () => {
    const bad = clone(qualified) as { evaluation: { score_breakdown: { urgency: number } } };
    bad.evaluation.score_breakdown.urgency = 3;
    const v = validateOutput(JSON.stringify(bad), TopicEvaluation);
    expect(!v.ok && v.error).toMatch(/score_breakdown\.urgency/);
  });

  it('rejects scores outside 1–10', () => {
    const bad = clone(qualified) as {
      evaluation: { criteria_scores: { urgency: { score: number } } };
    };
    bad.evaluation.criteria_scores.urgency.score = 11;
    expect(validateOutput(JSON.stringify(bad), TopicEvaluation).ok).toBe(false);
  });

  it('repairs an evaluation closed one brace early (fields left at the top level)', () => {
    const good = clone(qualified) as { evaluation: Record<string, unknown> };
    const { topic, criteria_scores, ...rest } = good.evaluation;
    const broken = JSON.stringify({ evaluation: { topic, criteria_scores }, ...rest }) + '}';
    const v = validateOutput(broken, TopicEvaluation);
    expect(v.ok).toBe(true);
    expect(v.ok && v.data.evaluation.total_score).toBe(good.evaluation.total_score);
  });

  it('keeps app-made titles short: 8 words at most', () => {
    const regen = structuredClone(claudeFixtures.topic_regenerate![0]) as {
      evaluation: { topic: string };
    };
    regen.evaluation.topic =
      'As a mid-career manager after an AI rollout will my role be redundant?';
    const v = validateOutput(JSON.stringify(regen), TopicRegeneration);
    expect(!v.ok && v.error).toMatch(/must be 8 words or fewer/);
    regen.evaluation.topic = 'Will AI Agents Replace My Management Role?';
    expect(validateOutput(JSON.stringify(regen), TopicRegeneration).ok).toBe(true);
    const monthly = MonthlyTopics.parse(claudeFixtures.topic_generate![0]);
    expect(monthly.topics).toHaveLength(10);
    expect(monthly.topics.every((t) => wordCount(t.topic_short) <= 8)).toBe(true);
  });

  it('gives a readable error for non-JSON output', () => {
    expect(validateOutput('Sure! Here is the evaluation.', TopicEvaluation)).toEqual({
      ok: false,
      error: 'The response was not valid JSON.',
    });
  });

  it('normalises six criteria rows in rubric order', () => {
    const ev = TopicEvaluation.parse(qualified).evaluation;
    const rows = toCriteria(ev);
    expect(rows.map((r) => r.key)).toEqual([
      'search_intent',
      'personal_consequence',
      'fear_curiosity',
      'specific_person',
      'urgency',
      'platform_invitation',
    ]);
    expect(rows.reduce((a, r) => a + r.score, 0)).toBe(ev.total_score);
    expect(rows.every((r) => r.max === 10 && r.reasoning.length > 0)).toBe(true);
    expect((rows[0]!.details.search_phrases as string[]).length).toBe(3);
  });

  it('turns format slips into warnings, not failures', () => {
    expect(evaluationWarnings(TopicEvaluation.parse(qualified).evaluation, 45)).toEqual([]);
    expect(evaluationWarnings(TopicEvaluation.parse(needsWork).evaluation, 45)).toEqual([]);
    const ev = TopicEvaluation.parse(qualified).evaluation;
    ev.criteria_scores.urgency.improvements = ['Add a deadline', 'Something else +5 pts'];
    ev.criteria_scores.search_intent.search_phrases = ['one'];
    ev.storyboard.shared_value = 'Job security';
    const w = evaluationWarnings(ev, 45);
    expect(w.some((x) => x.includes('search_phrases has 1 items'))).toBe(true);
    expect(w.some((x) => x.includes(`doesn't end with "+X pts": "Add a deadline"`))).toBe(true);
    expect(w.some((x) => x.includes('improvements claim +5 pts but the gap to 10 is 2'))).toBe(
      true,
    );
    expect(w.some((x) => x.includes('should be one word'))).toBe(true);
  });

  it('collects top and per-criterion improvements', () => {
    const all = collectImprovements(TopicEvaluation.parse(needsWork).evaluation);
    expect(all.length).toBe(3 + 6);
    expect(all.some((s) => s.startsWith('Search Intent Alignment: '))).toBe(true);
  });

  it('builds a real JSON Schema for the output contract', () => {
    const schema = zodToJsonSchema(TopicEvaluation as never, { $refStrategy: 'none' }) as {
      properties?: { evaluation?: { required?: string[] } };
    };
    expect(schema.properties?.evaluation?.required).toContain('criteria_scores');
  });

  it('prices calls per million tokens', () => {
    expect(costUsd('claude-sonnet-5-5', 1_000_000, 100_000)).toBe(3);
    expect(costUsd('unknown-model', 10, 10)).toBeUndefined();
  });
});

describe('topic helpers', () => {
  it('joins title and description', () => {
    expect(topicText({ title: ' Quit? ', description: null })).toBe('Quit?');
    expect(topicText({ title: 'Quit?', description: ' Or stay. ' })).toBe('Quit?\n\nOr stay.');
  });

  it('formats the local date in the time zone', () => {
    expect(localDate(new Date('2026-10-12T20:00:00Z'), 'Asia/Kolkata')).toBe('2026-10-13');
  });

  it('scores trigram similarity like pg_trgm', () => {
    expect(similarity('Should I quit my job', 'Should I quit my job')).toBe(1);
    expect(similarity('Should I quit my job?', 'should i QUIT my job')).toBe(1);
    expect(similarity('Quit my job', 'Bake sourdough bread')).toBeLessThan(0.1);
  });

  it('flags a near-duplicate from the last 12 months only', () => {
    const now = new Date('2026-10-13T00:00:00Z');
    const pool = [
      { id: 'old', title: 'Should I quit my job for AI?', created_at: '2025-06-01T00:00:00Z' },
      { id: 'recent', title: 'Should I quit my job for AI', created_at: '2026-09-01T00:00:00Z' },
      {
        id: 'other',
        title: 'Talking to teenagers about money',
        created_at: '2026-09-02T00:00:00Z',
      },
    ];
    expect(findDuplicate('Should I quit my job for AI?', pool, now)?.id).toBe('recent');
    expect(findDuplicate('How to plan a garden', pool, now)).toBeNull();
  });
});
