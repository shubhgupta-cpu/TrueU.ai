import { exportScript, generateScript, onScriptApproved, setupProject } from './projects.js';
import { generateBlog, onBlogApproved } from './blog.js';
import { generateCaptions } from './captions.js';
import { generateCtas, generatePolls } from './extras.js';
import { dispatchPost } from './publish.js';
import { scanUploads } from './uploads.js';
import { generateYouTube } from './youtube.js';
import type { JobRow } from './rules.js';
import { generateTopics, pullTrends, regenerateTopic, scoreTopic } from './topics.js';

export interface JobHandler {
  /** Returns the JSON stored in the job's Result. Throw PermanentJobError for errors retrying can't fix. */
  run: (job: JobRow) => Promise<Record<string, unknown>>;
  /** Called once when the job has failed for good (after its last attempt). */
  onFailed?: (job: JobRow, message: string) => Promise<void>;
}

// One entry per job type in docs/architecture.md §3. A function, not a module-level object, so the
// queue ↔ handler import cycle never reads a binding before it's initialised.
export function handlerFor(type: string): JobHandler | undefined {
  const handlers: Record<string, JobHandler> = {
    // Smoke test: proves queued → running → succeeded end to end (Jobs admin "Run test job").
    noop: { run: (job) => Promise.resolve({ ok: true, echoed: job.payload }) },
    score_topic: scoreTopic,
    regenerate_topic: regenerateTopic,
    generate_topics: generateTopics,
    pull_trends: pullTrends,
    setup_project: setupProject,
    generate_script: generateScript,
    export_script: exportScript,
    on_script_approved: onScriptApproved,
    generate_blog: generateBlog,
    on_blog_approved: onBlogApproved,
    generate_captions: generateCaptions,
    generate_youtube: generateYouTube,
    generate_ctas: generateCtas,
    generate_polls: generatePolls,
    scan_uploads: scanUploads,
    dispatch_post: dispatchPost,
  };
  return handlers[type];
}
