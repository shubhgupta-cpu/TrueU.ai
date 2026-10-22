// Airtable record → API shape (src/types/api.ts). Airtable omits empty fields, so every read has a
// fallback.
import type {
  BlogVersion,
  CaptionSet,
  ContentItem,
  Job,
  Profile,
  Project,
  Prompt,
  SeedKeyword,
  Topic,
  TopicScore,
  ProjectVideo,
  ScheduledPost,
  ScriptVersion,
} from '../src/types/api.js';
import { formatInTimeZone } from 'date-fns-tz';
import { type AtRecord, bool, jsonField, link, num, str } from './airtable.js';
import { Blog } from './schemas/blog.js';
import { Script } from './schemas/script.js';

const created = (r: AtRecord) => str(r.fields, 'Created') ?? r.createdTime;
const updated = (r: AtRecord) => str(r.fields, 'Updated') ?? created(r);

export function toProfile(r: AtRecord): Profile {
  return {
    id: r.id,
    email: str(r.fields, 'Email') ?? '',
    full_name: str(r.fields, 'Full Name'),
    role: (str(r.fields, 'Role') ?? 'editor') as Profile['role'],
  };
}

export function toTopic(r: AtRecord, latest?: TopicScore | null): Topic {
  const f = r.fields;
  return {
    id: r.id,
    topic_number: num(f, 'Topic Number') ?? 0,
    title: str(f, 'Title') ?? '(untitled)',
    description: str(f, 'Description'),
    category: str(f, 'Category'),
    owner_notes: str(f, 'Owner Notes'),
    source: (str(f, 'Source') ?? 'owner') as Topic['source'],
    source_detail: jsonField(f, 'Source Detail', {}),
    status: (str(f, 'Status') ?? 'new') as Topic['status'],
    score_total: num(f, 'Score Total'),
    score_max: num(f, 'Score Max'),
    latest_score_id: link(f, 'Latest Score'),
    last_error: str(f, 'Last Error'),
    duplicate_of: link(f, 'Duplicate Of'),
    selected_for_month: str(f, 'Selected For Month'),
    regenerated_from: link(f, 'Regenerated From'),
    regeneration_notes: str(f, 'Regeneration Notes'),
    project_id: link(f, 'Projects'),
    regenerating: false,
    created_at: created(r),
    updated_at: updated(r),
    latest_score: latest
      ? {
          id: latest.id,
          total: latest.total,
          passed: latest.passed,
          recommendation: latest.recommendation,
          created_at: latest.created_at,
        }
      : null,
  };
}

export function toTopicScore(r: AtRecord): TopicScore {
  const f = r.fields;
  return {
    id: r.id,
    topic_id: link(f, 'Topic') ?? '',
    total: num(f, 'Total') ?? 0,
    max_total: num(f, 'Max Total') ?? 60,
    passed: bool(f, 'Passed'),
    threshold: num(f, 'Threshold') ?? 45,
    recommendation: str(f, 'Recommendation'),
    criteria: jsonField(f, 'Criteria', []),
    evaluation: jsonField(f, 'Evaluation', {}),
    reasoning: str(f, 'Summary'),
    improvement_suggestions: str(f, 'Improvement Suggestions'),
    scored_topic_text: str(f, 'Scored Topic Text'),
    warnings: jsonField<string[]>(f, 'Warnings', []),
    prompt_key: str(f, 'Prompt Key'),
    prompt_version: num(f, 'Prompt Version'),
    model: str(f, 'Model'),
    created_at: created(r),
  };
}

export function toPrompt(r: AtRecord): Prompt {
  const f = r.fields;
  return {
    id: r.id,
    key: str(f, 'Key') ?? '',
    version: num(f, 'Version') ?? 1,
    title: str(f, 'Title') ?? '',
    body: (f['Body'] as string | undefined) ?? '',
    model: str(f, 'Model'),
    max_tokens: num(f, 'Max Tokens'),
    is_active: bool(f, 'Active'),
    notes: str(f, 'Notes'),
    created_at: created(r),
  };
}

export function toSeedKeyword(r: AtRecord): SeedKeyword {
  return {
    id: r.id,
    keyword: str(r.fields, 'Keyword') ?? '',
    is_active: bool(r.fields, 'Active'),
    created_at: created(r),
  };
}

export function toJob(r: AtRecord): Job {
  const f = r.fields;
  return {
    id: r.id,
    type: str(f, 'Type') ?? '',
    payload: jsonField(f, 'Payload', {}),
    status: (str(f, 'Status') ?? 'queued') as Job['status'],
    attempts: num(f, 'Attempts') ?? 0,
    max_attempts: num(f, 'Max Attempts') ?? 3,
    run_after: str(f, 'Run After'),
    last_error: str(f, 'Last Error'),
    result: jsonField(f, 'Result', null),
    project_id: link(f, 'Project'),
    created_at: created(r),
    updated_at: updated(r),
  };
}

export function toProject(r: AtRecord): Project {
  const f = r.fields;
  return {
    id: r.id,
    title: str(f, 'Title') ?? '(untitled)',
    topic_id: link(f, 'Topic'),
    cycle_month: str(f, 'Cycle Month'),
    sequence: num(f, 'Sequence'),
    slug: str(f, 'Slug'),
    status: (str(f, 'Status') ?? 'selected') as Project['status'],
    status_detail: str(f, 'Status Detail'),
    dropbox_folder_path: str(f, 'Dropbox Folder Path'),
    dropbox_shared_link: str(f, 'Dropbox Shared Link'),
    videos_folder_path: str(f, 'Videos Folder Path'),
    created_at: created(r),
    updated_at: updated(r),
  };
}

export function toScriptVersion(r: AtRecord): ScriptVersion {
  const f = r.fields;
  return {
    id: r.id,
    project_id: link(f, 'Project') ?? '',
    version: num(f, 'Version') ?? 1,
    status: (str(f, 'Status') ?? 'draft') as ScriptVersion['status'],
    title: str(f, 'Title'),
    script: Script.safeParse(jsonField(f, 'Script JSON', null)).data ?? null,
    warnings: jsonField<string[]>(f, 'Warnings', []),
    body_markdown: str(f, 'Body Markdown'),
    source: str(f, 'Source'),
    prompt_version: num(f, 'Prompt Version'),
    dropbox_path: str(f, 'Dropbox Path'),
    last_error: str(f, 'Last Error'),
    regen_notes: str(f, 'Regen Notes'),
    created_at: created(r),
  };
}

export function toBlogVersion(r: AtRecord): BlogVersion {
  const f = r.fields;
  return {
    id: r.id,
    project_id: link(f, 'Project') ?? '',
    version: num(f, 'Version') ?? 1,
    status: (str(f, 'Status') ?? 'draft') as BlogVersion['status'],
    title: str(f, 'Title'),
    blog: Blog.safeParse(jsonField(f, 'Blog JSON', null)).data ?? null,
    warnings: jsonField<string[]>(f, 'Warnings', []),
    category: str(f, 'Category'),
    primary_keyword: str(f, 'Primary Keyword'),
    word_count: num(f, 'Word Count'),
    regen_notes: str(f, 'Regen Notes'),
    prompt_version: num(f, 'Prompt Version'),
    dropbox_path: str(f, 'Dropbox Path'),
    last_error: str(f, 'Last Error'),
    created_at: created(r),
  };
}

export function toContentItem(r: AtRecord): ContentItem {
  const f = r.fields;
  return {
    id: r.id,
    channel: str(f, 'Channel') as ContentItem['channel'],
    post: str(f, 'Post') as ContentItem['post'],
    platform: str(f, 'Platform'),
    asset_role: str(f, 'Asset Role'),
    media_type: str(f, 'Media Type'),
    graphic_text: str(f, 'Title'),
    caption: (f['Caption'] as string | undefined) ?? '',
    hashtags: str(f, 'Hashtags') ?? '',
    extra: jsonField(f, 'Extra', {}),
    status: (str(f, 'Status') ?? 'draft') as ContentItem['status'],
    version: num(f, 'Version') ?? 1,
    warnings: jsonField<string[]>(f, 'Validation', []),
    review_notes: str(f, 'Review Notes'),
    approved_at: str(f, 'Approved At'),
    cta_group: str(f, 'CTA Group'),
    occurrence: num(f, 'Occurrence'),
    posted_on: Array.isArray(f['Posted On']) ? (f['Posted On'] as string[]) : [],
    results_notes: str(f, 'Results Notes'),
    created_at: created(r),
  };
}

export function toCaptionSet(r: AtRecord): CaptionSet {
  const f = r.fields;
  return {
    id: r.id,
    kind: (str(f, 'Kind') ?? 'social') as CaptionSet['kind'],
    version: num(f, 'Version') ?? 1,
    status: (str(f, 'Status') ?? 'draft') as CaptionSet['status'],
    warnings: jsonField<string[]>(f, 'Warnings', []),
    regen_scope: str(f, 'Regen Scope'),
    regen_notes: str(f, 'Regen Notes'),
    prompt_version: num(f, 'Prompt Version'),
    created_at: created(r),
    updated_at: updated(r),
  };
}

export function toProjectVideo(r: AtRecord): ProjectVideo {
  return {
    id: r.id,
    file_name: str(r.fields, 'File Name') ?? '',
    role: str(r.fields, 'Role') ?? 'other',
    settled: !!str(r.fields, 'Settled At'),
    detected_at: str(r.fields, 'Detected At') ?? created(r),
  };
}

export function toScheduledPost(
  r: AtRecord,
  projectTitle: string,
  timeZone: string,
  blocked: string | null,
): ScheduledPost {
  const f = r.fields;
  const at = str(f, 'Scheduled At') ?? '';
  return {
    id: r.id,
    project_id: link(f, 'Project'),
    project_title: projectTitle,
    asset_role: str(f, 'Asset Role'),
    platform: str(f, 'Platform') ?? 'other',
    day: num(f, 'Day Number') ?? 0,
    scheduled_at: at,
    local: at ? formatInTimeZone(new Date(at), timeZone, "yyyy-MM-dd'T'HH:mm") : '',
    custom: bool(f, 'Custom Time'),
    last_error: str(f, 'Last Error'),
    blocked,
    publish_status: (str(f, 'Publish Status') ?? 'planned') as ScheduledPost['publish_status'],
    optional: (str(f, 'Name') ?? '').includes('(optional)'),
  };
}
