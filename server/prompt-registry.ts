// Per prompt key: the output schema the app validates against, and sample variables for the
// Prompt manager's "Test run". Keys without a schema yet (later phases) are checked as JSON only.
import type { z } from 'zod';
import { Blog } from './schemas/blog.js';
import { Captions } from './schemas/captions.js';
import { YouTubeMeta } from './schemas/youtube.js';
import { Ctas, Polls } from './schemas/extras.js';
import { Script } from './schemas/script.js';
import {
  MonthlyTopics,
  TopicEvaluation,
  TopicRegeneration,
  TrendTopics,
} from './schemas/topics.js';

export interface PromptSpec {
  schema: z.ZodTypeAny | null;
  sample: Record<string, unknown>;
}

const SAMPLE_TOPIC = {
  topic:
    'Should I take the AI upskilling course my company is pushing — or start looking elsewhere?',
  topic_json: {
    title:
      'Should I take the AI upskilling course my company is pushing — or start looking elsewhere?',
    description: null,
    category: 'Transitions',
    source: 'owner',
    source_detail: {},
  },
  current_date: '2026-10-13',
};

export const PROMPT_SPECS: Record<string, PromptSpec> = {
  topic_score: { schema: TopicEvaluation, sample: SAMPLE_TOPIC },
  topic_regenerate: {
    schema: TopicRegeneration,
    sample: {
      ...SAMPLE_TOPIC,
      topic: 'Finding balance in a changing world',
      prior_improvements:
        '- Rewrite as a specific, searched decision question with a trigger event +8 pts\n- Name the person and the stake +6 pts',
    },
  },
  topic_generate: {
    schema: MonthlyTopics,
    sample: {
      month: 'October 2026',
      current_date: '2026-10-14',
      saved_topics: [],
      recent_titles: ['Will AI Agents Replace My Management Role?'],
      trend_query: 'career change',
      trend_data: {
        rising: ['career change at 40 (+250%)', 'should i quit before layoffs (+180%)'],
        top: ['career change ideas'],
      },
    },
  },
  trend_to_topic: {
    schema: TrendTopics,
    sample: {
      keyword: 'AI journal privacy',
      trend_items: [
        {
          engine: 'google_trends',
          query: 'is it safe to tell chatgpt personal things',
          value: '+350%',
        },
        { engine: 'google', query: 'Do AI chatbots store what you tell them?' },
      ],
      current_date: '2026-10-13',
    },
  },
};

PROMPT_SPECS.script_generate = {
  schema: Script,
  sample: {
    topic: SAMPLE_TOPIC.topic,
    episode_title: 'The Course Question',
    shared_value: 'Security',
    score_reasoning: 'Strong search intent and a clear trigger moment; the stake is personal.',
    notes: '',
    current_date: '2026-10-13',
  },
};

PROMPT_SPECS.blog_generate = {
  schema: Blog,
  sample: {
    topic_title: SAMPLE_TOPIC.topic,
    decision_domain: 'Transitions',
    script_summary:
      'Episode: The Course Question\n\nShared value: Security\n\nExample A (a manager who signed up on day one): she sees the course as a way to stay relevant.\n\nExample B (an analyst updating his CV): he reads the course as a signal that roles are changing.',
    primary_keyword: 'is ai upskilling worth it',
    secondary_keywords: 'should i learn ai for my job, company ai training, career change ai',
    search_intent:
      'People search when their employer announces AI training and they wonder whether to stay or leave.',
    notes: '',
    current_date: '2026-10-14',
  },
};

PROMPT_SPECS.captions_generate = {
  schema: Captions,
  sample: {
    content_title: 'The Course Question',
    content_type: 'video',
    topic_name: SAMPLE_TOPIC.topic,
    decision_domain: 'Transitions',
    key_message: 'Both sides of the course question are protecting the same thing: security.',
    content_url:
      'https://trueu.ai/blog/how-to-think-through-ai-upskilling?utm_source=social&utm_medium=organic&utm_campaign=how-to-think-through-ai-upskilling',
    weekly_hashtags: ['#CareerClarity', '#FutureOfWork', '#DecisionMaking'],
    notes: '',
    focus: '',
  },
};

PROMPT_SPECS.youtube_metadata_generate = {
  schema: YouTubeMeta,
  sample: {
    topic_title: SAMPLE_TOPIC.topic,
    decision_domain: 'Life Transition',
    video_duration: '11:00',
    script_summary:
      'The Course Question. A manager signed up for the AI course on day one; an analyst started updating his CV. Both are protecting the same thing: security.',
    key_timestamps: [
      { timestamp: '0:00', description: 'Introduction' },
      { timestamp: '0:30', description: 'Opening Examples' },
      { timestamp: '10:00', description: 'TrueU.ai: Your Private Thinking Partner' },
    ],
    primary_keyword: 'is ai upskilling worth it',
    secondary_keywords: [
      'should i take company ai training',
      'ai course or new job',
      'future of work',
    ],
    language: 'EN',
    video_id: 'vid202610010',
    related_video_urls: [],
    notes: '',
  },
};

PROMPT_SPECS.cta_generate = {
  schema: Ctas,
  sample: {
    video_id: 'vid202610010',
    video_title: 'The Course Question',
    category: 'Work & Meaning',
    key_points: [
      'Both sides are protecting the same thing: security.',
      'What are you protecting?',
      'Security could look different.',
    ],
    icp_segment: '',
    lead_magnet: '',
    blog_url: 'https://trueu.ai/blog/how-to-think-through-ai-upskilling',
    notes: '',
  },
};

PROMPT_SPECS.poll_generate = {
  schema: Polls,
  sample: {
    video_title: 'The Course Question',
    topic: SAMPLE_TOPIC.topic,
    script_summary:
      'A manager signed up for the AI course on day one; an analyst started updating his CV. Both are protecting security.',
    key_themes: 'Security; What are you protecting?; Security could look different.',
    notes: '',
  },
};

export function promptSpec(key: string): PromptSpec {
  return PROMPT_SPECS[key] ?? { schema: null, sample: {} };
}
