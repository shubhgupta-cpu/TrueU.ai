// Mirrors the single-select options in scripts/airtable/schema.mjs (ENUMS), which is the source:
// add a value there (then `npm run airtable:apply`) and in docs/spec.md §4 before adding it here.
// Every status renders as a label + tone, never colour alone.

export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'owner';

export interface StatusMeta {
  label: string;
  tone: Tone;
}

export const toneClasses: Record<Tone, string> = {
  neutral: 'bg-ground text-muted border-line',
  accent: 'bg-accent-soft text-accent border-accent/20',
  success: 'bg-success-soft text-success border-success/20',
  warning: 'bg-warning-soft text-warning border-warning/20',
  danger: 'bg-danger-soft text-danger border-danger/20',
  info: 'bg-info-soft text-info border-info/20',
  owner: 'bg-owner-soft text-owner border-owner/20',
};

export const appRoles = ['owner', 'editor', 'admin'] as const;
export type AppRole = (typeof appRoles)[number];
export const staffRoles: readonly AppRole[] = ['owner', 'admin'];

export const topicStatus = {
  new: { label: 'New', tone: 'neutral' },
  scoring: { label: 'Scoring', tone: 'info' },
  qualified: { label: 'Qualified', tone: 'success' },
  needs_work: { label: 'Needs work', tone: 'warning' },
  selected: { label: 'Selected', tone: 'accent' },
  saved: { label: 'Saved', tone: 'neutral' },
  rejected: { label: 'Rejected', tone: 'neutral' },
  error: { label: 'Error', tone: 'danger' },
} as const satisfies Record<string, StatusMeta>;
export type TopicStatus = keyof typeof topicStatus;

export const topicSource = {
  owner: { label: 'Owner', tone: 'owner' },
  claude: { label: 'Claude', tone: 'accent' },
  trending: { label: 'Trending', tone: 'info' },
} as const satisfies Record<string, StatusMeta>;
export type TopicSource = keyof typeof topicSource;

export const projectStatus = {
  selected: { label: 'Selected', tone: 'neutral' },
  script_draft: { label: 'Script draft', tone: 'neutral' },
  awaiting_script_approval: { label: 'Awaiting script approval', tone: 'warning' },
  script_approved: { label: 'Script approved', tone: 'success' },
  sent_to_editor: { label: 'Sent to editor', tone: 'accent' },
  awaiting_videos: { label: 'Awaiting videos', tone: 'warning' },
  videos_ready: { label: 'Videos ready', tone: 'success' },
  content_generating: { label: 'Generating content', tone: 'info' },
  content_review: { label: 'Content review', tone: 'warning' },
  scheduling: { label: 'Scheduling', tone: 'accent' },
  scheduled: { label: 'Scheduled', tone: 'accent' },
  published: { label: 'Published', tone: 'success' },
  on_hold: { label: 'On hold', tone: 'neutral' },
  error: { label: 'Error', tone: 'danger' },
} as const satisfies Record<string, StatusMeta>;
export type ProjectStatus = keyof typeof projectStatus;

export const versionStatus = {
  generating: { label: 'Generating', tone: 'info' },
  draft: { label: 'Draft', tone: 'neutral' },
  awaiting_approval: { label: 'Awaiting approval', tone: 'warning' },
  changes_requested: { label: 'Changes requested', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  superseded: { label: 'Superseded', tone: 'neutral' },
  error: { label: 'Error', tone: 'danger' },
  rejected: { label: 'Rejected', tone: 'danger' },
} as const satisfies Record<string, StatusMeta>;
export type VersionStatus = keyof typeof versionStatus;

export const itemStatus = {
  generating: { label: 'Generating', tone: 'info' },
  draft: { label: 'Draft', tone: 'neutral' },
  needs_edit: { label: 'Needs edit', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'neutral' },
  error: { label: 'Error', tone: 'danger' },
  superseded: { label: 'Superseded', tone: 'neutral' },
} as const satisfies Record<string, StatusMeta>;
export type ItemStatus = keyof typeof itemStatus;

export const publishStatus = {
  planned: { label: 'Planned', tone: 'neutral' },
  waiting_approval: { label: 'Waiting approval', tone: 'warning' },
  queued: { label: 'Queued', tone: 'accent' },
  sent: { label: 'Sent', tone: 'accent' },
  scheduled: { label: 'Scheduled', tone: 'info' },
  published: { label: 'Published', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
} as const satisfies Record<string, StatusMeta>;
export type PublishStatus = keyof typeof publishStatus;

export const graphicStatus = {
  queued: { label: 'Queued', tone: 'neutral' },
  rendering: { label: 'Rendering', tone: 'info' },
  ready: { label: 'Ready', tone: 'accent' },
  needs_edit: { label: 'Needs edit', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
} as const satisfies Record<string, StatusMeta>;
export type GraphicStatus = keyof typeof graphicStatus;

export const jobStatus = {
  queued: { label: 'Queued', tone: 'neutral' },
  running: { label: 'Running', tone: 'info' },
  succeeded: { label: 'Succeeded', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
} as const satisfies Record<string, StatusMeta>;
export type JobStatus = keyof typeof jobStatus;

export function isStaff(role: AppRole | null | undefined): boolean {
  return role != null && staffRoles.includes(role);
}
