import { describe, expect, it } from 'vitest';
import { pipelineSteps } from '@/features/projects/steps';
import type { BlogVersion, Job, ProjectDetail, ScriptVersion } from '@/types/api';

const emptySet = { set: null, items: [], versions: 0 };

function project(over: Partial<ProjectDetail> = {}): ProjectDetail {
  return {
    id: 'p1',
    title: 'T',
    topic_id: 't1',
    cycle_month: '2026-10-01',
    sequence: 1,
    slug: 'T',
    status: 'selected',
    status_detail: null,
    dropbox_folder_path: null,
    dropbox_shared_link: null,
    videos_folder_path: null,
    created_at: '2026-10-14T00:00:00Z',
    updated_at: '2026-10-14T00:00:00Z',
    topic: {
      source: 'claude',
      status: 'selected',
      score_total: 51,
      score_max: 60,
      regenerated_from: null,
      created_at: '2026-10-13T00:00:00Z',
      scored_at: '2026-10-13T00:01:00Z',
    },
    scripts: [],
    blogs: [],
    captions: emptySet,
    youtube: emptySet,
    ctas: emptySet,
    polls: emptySet,
    videos: [],
    transcripts: [],
    jobs: [],
    ...over,
  };
}

const job = (type: string, status: Job['status'], last_error: string | null = null): Job => ({
  id: `${type}-${status}`,
  type,
  payload: {},
  status,
  attempts: 1,
  max_attempts: 2,
  run_after: null,
  last_error,
  result: null,
  project_id: 'p1',
  created_at: '2026-10-14T00:00:00Z',
  updated_at: '2026-10-14T00:00:00Z',
});

const script = (status: ScriptVersion['status'], version = 1) =>
  ({ id: `s${version}`, version, status }) as ScriptVersion;
const blog = (status: BlogVersion['status'], dropbox_path: string | null = null) =>
  ({ id: 'b1', version: 1, status, dropbox_path, word_count: 1700 }) as BlogVersion;

const states = (p: ProjectDetail) =>
  Object.fromEntries(pipelineSteps(p).map((s) => [s.key, s.state]));

describe('project pipeline steps', () => {
  it('numbers 11 steps in order', () => {
    const steps = pipelineSteps(project());
    expect(steps.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(steps.map((s) => s.label)).toEqual([
      'Topic added',
      'Topic scored',
      'Dropbox folder',
      'Script written',
      'Script approved',
      'Blog written',
      'Blog approved & saved to Dropbox',
      'Social captions',
      'YouTube metadata',
      'CTAs & hooks',
      'Polls',
    ]);
    expect(steps[0]!.detail).toBe('Claude topic generation');
    expect(steps[1]!.detail).toBe('51/60');
  });

  it('just selected: folder and script running, everything after waiting', () => {
    const s = states(
      project({ jobs: [job('setup_project', 'running'), job('generate_script', 'queued')] }),
    );
    expect(s).toMatchObject({
      topic: 'done',
      score: 'done',
      folder: 'running',
      script: 'running',
      script_approval: 'waiting',
      blog: 'waiting',
      polls: 'waiting',
    });
  });

  it('script written and waiting for the owner', () => {
    const s = states(
      project({ dropbox_folder_path: '/Year - 2026/October 2026/T', scripts: [script('draft')] }),
    );
    expect(s).toMatchObject({
      folder: 'done',
      script: 'done',
      script_approval: 'review',
      blog: 'waiting',
    });
  });

  it('a failed job shows its reason', () => {
    const steps = pipelineSteps(
      project({ jobs: [job('setup_project', 'failed', 'Dropbox isn’t connected')] }),
    );
    expect(steps[2]).toMatchObject({ state: 'failed', error: 'Dropbox isn’t connected' });
  });

  it('blog approved but not yet in Dropbox is in progress; once saved it is done', () => {
    const base = { dropbox_folder_path: '/f', scripts: [script('approved')] };
    expect(states(project({ ...base, blogs: [blog('approved')] })).blog_approval).toBe('running');
    expect(
      states(project({ ...base, blogs: [blog('approved', '/f/Blog_Script/blog_APPROVED.docx')] }))
        .blog_approval,
    ).toBe('done');
    expect(states(project({ ...base, blogs: [blog('draft')] })).blog_approval).toBe('review');
  });

  it('after blog approval, sets not generated yet are "not started"; pending items need review', () => {
    const items = [
      { status: 'approved' },
      { status: 'draft' },
    ] as ProjectDetail['captions']['items'];
    const p = project({
      dropbox_folder_path: '/f',
      scripts: [script('approved')],
      blogs: [blog('approved', '/f/x.docx')],
      captions: { set: { version: 1 } as ProjectDetail['captions']['set'], items, versions: 1 },
      jobs: [job('generate_youtube', 'running')],
    });
    const steps = pipelineSteps(p);
    const by = Object.fromEntries(steps.map((s) => [s.key, s]));
    expect(by.captions).toMatchObject({ state: 'review', detail: 'v1 · 1/2 posts approved' });
    expect(by.youtube!.state).toBe('running');
    expect(by.ctas!.state).toBe('todo');
  });
});
