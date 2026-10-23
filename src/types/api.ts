// Shapes returned by the /api functions. Shared by the browser and the server (server/mappers.ts
// builds them from Airtable records). IDs are Airtable record IDs ("rec…"); times are UTC ISO.
import type {
  AppRole,
  ItemStatus,
  JobStatus,
  ProjectStatus,
  TopicSource,
  TopicStatus,
  VersionStatus,
} from '@/lib/status';

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: AppRole;
}

export interface ScoreSummary {
  id: string;
  total: number;
  passed: boolean;
  recommendation: string | null;
  created_at: string;
}

export interface Topic {
  id: string;
  topic_number: number;
  title: string;
  description: string | null;
  category: string | null;
  owner_notes: string | null;
  source: TopicSource;
  source_detail: Json;
  status: TopicStatus;
  score_total: number | null;
  score_max: number | null;
  latest_score_id: string | null;
  last_error: string | null;
  duplicate_of: string | null;
  selected_for_month: string | null;
  regenerated_from: string | null;
  regeneration_notes: string | null;
  project_id: string | null;
  /** A rewrite from the score's suggestions is queued or running (only set by the topic list). */
  regenerating: boolean;
  created_at: string;
  updated_at: string;
  latest_score: ScoreSummary | null;
}

export interface TopicScore {
  id: string;
  topic_id: string;
  total: number;
  max_total: number;
  passed: boolean;
  threshold: number;
  recommendation: string | null;
  criteria: Json;
  evaluation: Json;
  reasoning: string | null;
  improvement_suggestions: string | null;
  scored_topic_text: string | null;
  warnings: string[];
  prompt_key: string | null;
  prompt_version: number | null;
  model: string | null;
  created_at: string;
}

export interface Prompt {
  id: string;
  key: string;
  version: number;
  title: string;
  body: string;
  model: string | null;
  max_tokens: number | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
}

export interface SeedKeyword {
  id: string;
  keyword: string;
  is_active: boolean;
  created_at: string;
}

export interface Job {
  id: string;
  type: string;
  payload: Json;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  run_after: string | null;
  last_error: string | null;
  result: Json;
  project_id: string | null;
  created_at: string;
  updated_at: string;
}

/** The script_generate output (the client's storyboard JSON). */
export type { Script } from '../../server/schemas/script.js';
import type { Script } from '../../server/schemas/script.js';

export interface ScriptVersion {
  id: string;
  project_id: string;
  version: number;
  status: VersionStatus;
  title: string | null;
  /** Null for a version whose JSON is missing or unreadable (e.g. edited by hand in Airtable). */
  script: Script | null;
  warnings: string[];
  body_markdown: string | null;
  source: string | null;
  prompt_version: number | null;
  dropbox_path: string | null;
  last_error: string | null;
  regen_notes: string | null;
  created_at: string;
}

export interface Project {
  id: string;
  title: string;
  topic_id: string | null;
  cycle_month: string | null;
  sequence: number | null;
  slug: string | null;
  status: ProjectStatus;
  status_detail: string | null;
  dropbox_folder_path: string | null;
  dropbox_shared_link: string | null;
  /** Set when the editor's videos are in a different folder than the one the app created. */
  videos_folder_path: string | null;
  created_at: string;
  updated_at: string;
}

/** The blog_generate output (the client's blog JSON). */
export type { Blog } from '../../server/schemas/blog.js';
import type { Blog } from '../../server/schemas/blog.js';

export interface BlogVersion {
  id: string;
  project_id: string;
  version: number;
  status: VersionStatus;
  title: string | null;
  /** Null when the stored JSON is missing or unreadable. */
  blog: Blog | null;
  warnings: string[];
  category: string | null;
  primary_keyword: string | null;
  word_count: number | null;
  regen_notes: string | null;
  prompt_version: number | null;
  dropbox_path: string | null;
  last_error: string | null;
  created_at: string;
}

export type SocialChannel =
  | 'linkedin'
  | 'linkedin_carousel'
  | 'instagram'
  | 'twitter'
  | 'facebook'
  | 'pinterest'
  | 'threads'
  | 'reels_tiktok'
  | 'youtube'
  | 'cta'
  | 'poll';
export type SocialPost = 'image' | 'video_1' | 'video_2' | 'video_3' | 'long_video';

/** One social post (Airtable "Content Items"). */
export interface ContentItem {
  id: string;
  channel: SocialChannel | null;
  post: SocialPost | null;
  platform: string | null;
  asset_role: string | null;
  media_type: string | null;
  /** Quote / Pinterest title / carousel cover shown on the image. */
  graphic_text: string | null;
  caption: string;
  hashtags: string;
  extra: {
    graphic_label?: string;
    graphic_points?: string;
    cover_subtext?: string;
    slides?: Array<{ number?: number; headline: string; body: string }>;
    // YouTube items
    title_options?: string[];
    tags?: string[];
    thumbnail_text_options?: Array<{ headline: string; subtext?: string }>;
    seo_notes?: {
      primary_keyword?: string;
      search_volume_estimate?: string;
      competition?: string;
      recommended_title_rationale?: string;
    };
    duration?: string;
    // Polls
    expected_split?: string;
    why_engaging?: string;
    platform_note?: string;
    // CTA items keep their fields here too (field name → text)
    [key: string]: unknown;
  };
  cta_group: string | null;
  occurrence: number | null;
  posted_on: string[];
  results_notes: string | null;
  status: ItemStatus;
  version: number;
  warnings: string[];
  review_notes: string | null;
  approved_at: string | null;
  created_at: string;
}

/** One run of the social caption prompt (Airtable "Caption Sets"). */
export interface CaptionSet {
  id: string;
  kind: 'social' | 'youtube' | 'cta' | 'poll';
  version: number;
  status: VersionStatus;
  warnings: string[];
  regen_scope: string | null;
  regen_notes: string | null;
  prompt_version: number | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectDetail extends Project {
  /** The selected topic: where it came from and its score (pipeline steps 1–2). */
  topic: {
    source: TopicSource;
    status: TopicStatus;
    score_total: number | null;
    score_max: number | null;
    regenerated_from: string | null;
    created_at: string;
    scored_at: string | null;
  } | null;
  scripts: ScriptVersion[];
  blogs: BlogVersion[];
  /** The current caption set and its live posts (superseded posts left out). */
  captions: { set: CaptionSet | null; items: ContentItem[]; versions: number };
  /** The current YouTube metadata set: long video + 3 shorts. */
  youtube: { set: CaptionSet | null; items: ContentItem[]; versions: number };
  /** CTAs & hooks: one item per platform group. */
  ctas: { set: CaptionSet | null; items: ContentItem[]; versions: number };
  /** 5 Yes/No polls. */
  polls: { set: CaptionSet | null; items: ContentItem[]; versions: number };
  /** The editor's videos found in Dropbox (current files only). */
  videos: ProjectVideo[];
  /** Speech-to-text of those videos (latest per video), used for the YouTube chapters and description. */
  transcripts: ProjectTranscript[];
  jobs: Job[];
}

export interface ScheduledPost {
  id: string;
  project_id: string | null;
  project_title: string;
  asset_role: string | null;
  platform: string;
  day: number;
  scheduled_at: string;
  /** Local time in settings.timezone, 'YYYY-MM-DDTHH:mm' (for the time editor). */
  local: string;
  custom: boolean;
  last_error: string | null;
  /** Why the post can't be sent yet (caption not approved, video missing), or null when it is ready. */
  blocked: string | null;
  publish_status:
    | 'planned'
    | 'waiting_approval'
    | 'queued'
    | 'sent'
    | 'scheduled'
    | 'published'
    | 'failed'
    | 'cancelled';
  optional: boolean;
}

export interface ScheduleView {
  timezone: string;
  posts: ScheduledPost[];
}

export interface ProjectVideo {
  id: string;
  file_name: string;
  /** long_video, short_1..3, or other when the file name doesn't say which short it is. */
  role: string;
  /** False while the file may still be uploading. */
  settled: boolean;
  detected_at: string;
}

/** One approved-or-draft caption shown the way a platform would show it. */
export interface PostPreview {
  key: string;
  platform: string;
  /** long_video, short_1..3 */
  asset_role: string;
  title: string | null;
  caption: string;
  hashtags: string;
  status: ItemStatus;
  /** The editor's video for this post, when found in Dropbox. */
  video_id: string | null;
}

/** A person with a login (Admin → Users). */
export interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  role: 'admin' | 'owner' | 'editor';
  /** False when access was removed (no password), so they can't sign in. */
  active: boolean;
  locked_until: string | null;
  last_sign_in: string | null;
  created_at: string;
}

export interface UsageTotals {
  calls: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
}

/** Claude / SerpAPI / Bannerbear usage for the last 90 days (Admin → Usage). */
export interface UsageSummary {
  since: string;
  total: UsageTotals;
  by_month: Array<UsageTotals & { month: string }>;
  by_prompt: Array<UsageTotals & { key: string; avg_ms: number }>;
  by_project: Array<UsageTotals & { project: string }>;
  by_provider: Array<UsageTotals & { provider: string }>;
  recent: Array<{
    at: string;
    provider: string;
    key: string;
    model: string;
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
    ms: number;
  }>;
}

/** One row of Settings → Integrations. Never carries a secret value. */
export interface IntegrationCheck {
  group: string;
  name: string;
  status: 'ok' | 'missing' | 'error';
  detail: string;
  /** When it last did something (last call, last check), if known. */
  at: string | null;
}

/** Settings → Platforms: what the app really uses for a platform (read-only). */
export interface PlatformRule {
  platform: string;
  label: string;
  caption_min: number | null;
  caption_max: number | null;
  visible_chars: number | null;
  webhook_fields: string[];
  webhook_env: string | null;
}

/** One post of the default 15-day plan (Settings → Schedule templates). */
export interface TemplateSlot {
  id: string;
  day: number;
  platform: string;
  asset_role: string | null;
  local_time: string;
  notes: string | null;
  best_time: boolean;
}

export interface ProjectTranscript {
  /** long_video or short_1..3 */
  role: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  error: string | null;
  /** The file has times, so the chapters can be exact; without them only the description comes from it. */
  timed: boolean;
}
