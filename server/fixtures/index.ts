// Fixtures for MOCK_EXTERNAL=true (CLAUDE.md rule 14). TS modules, so they're bundled with the
// /api function without JSON import attributes.
import blogGenerate from './claude/blog_generate.js';
import captionsGenerate from './claude/captions_generate.js';
import ctaGenerate from './claude/cta_generate.js';
import pollGenerate from './claude/poll_generate.js';
import scriptGenerate from './claude/script_generate.js';
import topicGenerate from './claude/topic_generate.js';
import topicRegenerate from './claude/topic_regenerate.js';
import topicScoreNeedsWork from './claude/topic_score_needs_work.js';
import topicScoreQualified from './claude/topic_score_qualified.js';
import trendToTopic from './claude/trend_to_topic.js';
import youtubeMetadata from './claude/youtube_metadata_generate.js';
import serpGoogle from './serp/google.js';
import serpGoogleTrends from './serp/google_trends.js';
import serpYoutube from './serp/youtube.js';

export const fixtures = {
  'serp/google_trends': serpGoogleTrends,
  'serp/youtube': serpYoutube,
  'serp/google': serpGoogle,
} as const;

export type FixtureName = keyof typeof fixtures;

/** Returns a deep copy so callers can mutate it freely. */
export function fixture<N extends FixtureName>(name: N): (typeof fixtures)[N] {
  return structuredClone(fixtures[name]);
}

/**
 * Mock Claude responses per prompt key. With several variants, the mock picks one
 * deterministically from the prompt variables, so the same topic always scores the same.
 */
export const claudeFixtures: Record<string, readonly unknown[]> = {
  topic_score: [topicScoreQualified, topicScoreNeedsWork],
  topic_regenerate: [topicRegenerate],
  topic_generate: [topicGenerate],
  trend_to_topic: [trendToTopic],
  script_generate: [scriptGenerate],
  blog_generate: [blogGenerate],
  captions_generate: [captionsGenerate],
  youtube_metadata_generate: [youtubeMetadata],
  cta_generate: [ctaGenerate],
  poll_generate: [pollGenerate],
};
