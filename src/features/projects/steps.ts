// The project pipeline as numbered steps (topic → score → folder → script → … → polls), derived
// from the project's data and its latest job per step. Pure, so it's unit-tested.
import type { Job, ProjectDetail } from '@/types/api';

export type StepState = 'done' | 'running' | 'failed' | 'review' | 'waiting' | 'todo';

export interface Step {
  n: number;
  key: string;
  label: string;
  state: StepState;
  detail: string | null;
  error: string | null;
}

export const STEP_STATE_META: Record<
  StepState,
  { label: string; tone: 'success' | 'info' | 'danger' | 'warning' | 'neutral' }
> = {
  done: { label: 'Done', tone: 'success' },
  running: { label: 'In progress', tone: 'info' },
  failed: { label: 'Failed', tone: 'danger' },
  review: { label: 'Needs your review', tone: 'warning' },
  waiting: { label: 'Waiting', tone: 'neutral' },
  todo: { label: 'Not started', tone: 'neutral' },
};

const SOURCE: Record<string, string> = {
  owner: 'Submitted by the owner',
  claude: 'Claude topic generation',
  trending: 'Trending topics (SerpAPI)',
};

const busy = (j: Job | undefined) => j?.status === 'queued' || j?.status === 'running';

/**
 * A generated step: running while its job runs; done (or "needs review" while items are pending)
 * once there's output; failed if its last job failed with no output; otherwise waiting for the
 * previous step, or "not started" if it could run (older projects).
 */
function generated(
  job: Job | undefined,
  has: boolean,
  ready: boolean,
  detail: string | null,
  pending = false,
): Pick<Step, 'state' | 'detail' | 'error'> {
  if (busy(job)) return { state: 'running', detail: has ? detail : null, error: null };
  if (has) {
    const lastFailed =
      job?.status === 'failed' ? `Last regenerate failed: ${job.last_error ?? ''}` : null;
    return { state: pending ? 'review' : 'done', detail, error: lastFailed };
  }
  if (job?.status === 'failed') return { state: 'failed', detail: null, error: job.last_error };
  return { state: ready ? 'todo' : 'waiting', detail: null, error: null };
}

export function pipelineSteps(p: ProjectDetail): Step[] {
  const latest = (type: string) => p.jobs.find((j) => j.type === type); // jobs are newest first
  const t = p.topic;
  const script = p.scripts[0];
  const scriptApproved = p.scripts.find((s) => s.status === 'approved');
  const blog = p.blogs[0];
  const blogApproved = p.blogs.find((b) => b.status === 'approved');
  const blogInDropbox = !!blogApproved?.dropbox_path;
  const setInfo = (s: ProjectDetail['captions'], noun: string) => {
    const approved = s.items.filter((i) => i.status === 'approved').length;
    const pending = s.items.filter((i) => i.status === 'draft' || i.status === 'needs_edit').length;
    return {
      detail: `v${s.set?.version} · ${approved}/${s.items.length} ${noun} approved`,
      pending: pending > 0,
    };
  };

  const steps: Array<Omit<Step, 'n'>> = [];
  const add = (key: string, label: string, s: Pick<Step, 'state' | 'detail' | 'error'>) =>
    steps.push({ key, label, ...s });

  add('topic', 'Topic added', {
    state: t ? 'done' : 'waiting',
    detail: t
      ? `${SOURCE[t.source] ?? t.source}${t.regenerated_from ? ' · improved version' : ''}`
      : null,
    error: null,
  });
  add('score', 'Topic scored', {
    state:
      t?.score_total != null
        ? 'done'
        : t?.status === 'error'
          ? 'failed'
          : t
            ? 'running'
            : 'waiting',
    detail: t?.score_total != null ? `${t.score_total}/${t.score_max ?? 60}` : null,
    error: null,
  });
  add(
    'folder',
    'Dropbox folder',
    generated(latest('setup_project'), !!p.dropbox_folder_path, true, p.dropbox_folder_path),
  );
  add(
    'script',
    'Script written',
    generated(latest('generate_script'), !!script, true, script ? `v${script.version}` : null),
  );
  add('script_approval', 'Script approved', {
    state: scriptApproved
      ? 'done'
      : script && !busy(latest('generate_script'))
        ? 'review'
        : 'waiting',
    detail: scriptApproved ? `v${scriptApproved.version}` : null,
    error: null,
  });
  add(
    'blog',
    'Blog written',
    generated(
      latest('generate_blog'),
      !!blog,
      !!scriptApproved,
      blog ? `v${blog.version}${blog.word_count ? ` · ${blog.word_count} words` : ''}` : null,
    ),
  );
  const exportJob = latest('on_blog_approved');
  add('blog_approval', 'Blog approved & saved to Dropbox', {
    state: blogInDropbox
      ? 'done'
      : blogApproved
        ? exportJob?.status === 'failed'
          ? 'failed'
          : 'running'
        : blog && blog.status === 'draft' && !busy(latest('generate_blog'))
          ? 'review'
          : 'waiting',
    detail: blogApproved
      ? `v${blogApproved.version}${blogInDropbox ? ' · Blog_Script folder' : ''}`
      : null,
    error:
      blogApproved && !blogInDropbox && exportJob?.status === 'failed'
        ? exportJob.last_error
        : null,
  });

  for (const [key, label, type, set, noun] of [
    ['captions', 'Social captions', 'generate_captions', p.captions, 'posts'],
    ['youtube', 'YouTube metadata', 'generate_youtube', p.youtube, 'videos'],
    ['ctas', 'CTAs & hooks', 'generate_ctas', p.ctas, 'platforms'],
    ['polls', 'Polls', 'generate_polls', p.polls, 'polls'],
  ] as const) {
    const info = set.set ? setInfo(set, noun) : null;
    add(
      key,
      label,
      generated(latest(type), !!set.set, !!blogApproved, info?.detail ?? null, info?.pending),
    );
  }

  return steps.map((s, i) => ({ ...s, n: i + 1 }));
}
