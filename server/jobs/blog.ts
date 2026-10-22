// Blog jobs (F9): generate_blog runs blog_generate from the approved script; on_blog_approved
// writes the approved blog to the topic's Blog_Script folder. Only the approved blog goes to
// Dropbox; drafts are reviewed in the app.
import { z } from 'zod';
import {
  type AtRecord,
  byIds,
  createOne,
  get,
  jsonField,
  list,
  nowIso,
  num,
  str,
  T,
  toJson,
  updateOne,
} from '../airtable.js';
import { blogDocx, blogMarkdown } from '../blog-doc.js';
import { runPrompt } from '../claude.js';
import { deleteFiles, upload } from '../dropbox.js';
import { activity } from '../log.js';
import { blogFileName, layoutFrom } from '../paths.js';
import { loadProject, setProjectStatus } from '../repo/projects.js';
import { loadTopic } from '../repo/topics.js';
import { Blog, blogCategory, blogInput, blogWarnings, blogWordCount } from '../schemas/blog.js';
import { Script } from '../schemas/script.js';
import { getSettings } from '../settings.js';
import { localDate } from '../topics.js';
import type { JobHandler } from './handlers.js';
import { DuplicateJobError, enqueue } from './queue.js';
import { scriptVersions } from './projects.js';
import { PermanentJobError } from './rules.js';
import { payload } from './topics.js';

/** Every blog version of a project, newest first. */
export async function blogVersions(projectId: string): Promise<AtRecord[]> {
  const ids =
    ((await get(T.projects, projectId))?.fields['Blog Versions'] as string[] | undefined) ?? [];
  if (!ids.length) return [];
  const rows = await list(T.blogVersions, { filterByFormula: byIds(ids) });
  return rows.sort((a, b) => (num(b.fields, 'Version') ?? 0) - (num(a.fields, 'Version') ?? 0));
}

async function mustLoadProject(id: string) {
  const project = await loadProject(id);
  if (!project) throw new PermanentJobError(`Project ${id} not found`);
  return project;
}

/** Removes the approved blog's files from Dropbox (when a newer version replaces it). */
async function removeApprovedFiles(folderPath: string | null): Promise<void> {
  if (!folderPath) return;
  const { dropbox } = await getSettings(['dropbox'] as const);
  const dir = `${folderPath}/${layoutFrom(dropbox).blog_folder}`;
  await deleteFiles([`${dir}/${blogFileName('docx')}`, `${dir}/${blogFileName('md')}`]);
}

const GeneratePayload = z.object({ project_id: z.string().min(1), notes: z.string().optional() });

export const generateBlog: JobHandler = {
  async run(job) {
    const { project_id, notes } = payload(GeneratePayload, job.payload);
    const project = await mustLoadProject(project_id);
    const approvedScript = (await scriptVersions(project.id)).find(
      (r) => str(r.fields, 'Status') === 'approved',
    );
    if (!approvedScript)
      throw new PermanentJobError(
        'Approve the script first: the blog is written from the approved script.',
      );
    const script =
      Script.safeParse(jsonField(approvedScript.fields, 'Script JSON', null)).data ?? null;

    const topic = project.topic_id ? await loadTopic(project.topic_id) : null;
    const score = topic?.latest_score_id ? await get(T.topicScores, topic.latest_score_id) : null;
    const evaluation = score
      ? jsonField<Record<string, unknown>>(score.fields, 'Evaluation', {})
      : {};
    const { timezone } = await getSettings(['timezone'] as const);

    const run = await runPrompt(
      'blog_generate',
      {
        ...blogInput({
          topicTitle: topic?.title ?? project.title,
          category: topic?.category ?? null,
          evaluation,
          script,
        }),
        notes: notes ?? '',
        current_date: localDate(new Date(), timezone),
      },
      Blog,
      { jobId: job.id, projectId: project.id },
    );
    const blog = run.data;
    const category = blogCategory(blog, run.raw);
    const warnings = blogWarnings(blog, run.raw);
    const wordCount = blogWordCount(blog);

    const earlier = await blogVersions(project.id);
    const version = (num(earlier[0]?.fields ?? {}, 'Version') ?? 0) + 1;
    // The new version replaces earlier ones; an approved one lapses and leaves Dropbox.
    const hadApproved = earlier.some((r) => str(r.fields, 'Status') === 'approved');
    const stale = earlier.filter(
      (r) => !['superseded', 'rejected'].includes(str(r.fields, 'Status') ?? ''),
    );
    await Promise.all(
      stale.map((r) =>
        updateOne(T.blogVersions, r.id, {
          Status: 'superseded',
          'Dropbox Path': null,
          Updated: nowIso(),
        }),
      ),
    );
    if (hadApproved) await removeApprovedFiles(project.dropbox_folder_path);

    const now = nowIso();
    const rec = await createOne(T.blogVersions, {
      Name: `${project.title} · blog v${version}`,
      Project: [project.id],
      Version: version,
      Status: 'draft',
      Title: blog.title,
      Slug: blog.slug,
      'Meta Description': blog.meta_description,
      'Body Markdown': blogMarkdown(blog, {
        projectTitle: project.title,
        version,
        category,
        wordCount,
        generatedAt: localDate(new Date(), timezone),
      }),
      'Blog JSON': toJson({ ...blog, category: category ?? blog.category }),
      Warnings: toJson(warnings),
      Category: category,
      'Primary Keyword': blog.primary_keyword,
      'Word Count': wordCount,
      Source: 'claude',
      'Regen Notes': notes,
      'Prompt Key': run.prompt.key,
      'Prompt Version': run.prompt.version,
      Created: now,
      Updated: now,
    });

    const fresh = await mustLoadProject(project.id);
    await setProjectStatus(fresh, fresh.status, `Blog v${version} ready for review.`);
    await activity({
      event: 'blog_generated',
      projectId: project.id,
      details: {
        version,
        version_id: rec.id,
        words: wordCount,
        warnings: warnings.length,
        notes: notes ?? null,
      },
    });
    return { version_id: rec.id, version, words: wordCount };
  },

  async onFailed(job, message) {
    const parsed = GeneratePayload.safeParse(job.payload);
    if (!parsed.success) return;
    const project = await loadProject(parsed.data.project_id);
    if (project)
      await setProjectStatus(project, project.status, `Blog generation failed: ${message}`);
  },
};

const ApprovedPayload = z.object({ version_id: z.string().min(1) });

/** The approved blog → {topic folder}/Blog_Script/blog_APPROVED.docx and .md. */
export const onBlogApproved: JobHandler = {
  async run(job) {
    const { version_id } = payload(ApprovedPayload, job.payload);
    const rec = await get(T.blogVersions, version_id);
    if (!rec) throw new PermanentJobError(`Blog version ${version_id} not found`);
    if (str(rec.fields, 'Status') !== 'approved')
      return { skipped: 'no longer the approved version' };
    const projectId = (rec.fields['Project'] as string[] | undefined)?.[0];
    const project = projectId ? await mustLoadProject(projectId) : null;
    if (!project?.dropbox_folder_path)
      throw new Error('The project’s Dropbox folder isn’t ready yet');

    const parsed = Blog.safeParse(jsonField(rec.fields, 'Blog JSON', null));
    if (!parsed.success)
      throw new PermanentJobError('This version has no readable Blog JSON in Airtable');
    const version = num(rec.fields, 'Version') ?? 1;
    const { timezone, dropbox } = await getSettings(['timezone', 'dropbox'] as const);
    const folder = layoutFrom(dropbox).blog_folder;
    const meta = {
      projectTitle: project.title,
      version,
      category: str(rec.fields, 'Category'),
      wordCount: num(rec.fields, 'Word Count') ?? blogWordCount(parsed.data),
      generatedAt: localDate(new Date(str(rec.fields, 'Created') ?? Date.now()), timezone),
    };
    const dir = `${project.dropbox_folder_path}/${folder}`;
    const docx = await upload(
      `${dir}/${blogFileName('docx')}`,
      await blogDocx(parsed.data, meta),
      'overwrite',
    );
    await upload(
      `${dir}/${blogFileName('md')}`,
      new TextEncoder().encode(blogMarkdown(parsed.data, meta)),
      'overwrite',
    );

    await updateOne(T.blogVersions, version_id, {
      'Dropbox Path': docx.path_display,
      'Dropbox Rev': docx.rev,
      'Last Error': null,
      Updated: nowIso(),
    });
    const fresh = await mustLoadProject(project.id);
    await setProjectStatus(
      fresh,
      fresh.status,
      `Blog v${version} approved and saved to ${folder}/${blogFileName('docx')}.`,
    );
    await activity({
      event: 'blog_exported',
      projectId: project.id,
      details: { version, path: docx.path_display },
    });

    // F10: once the blog is approved and in Dropbox: social captions, YouTube metadata (long video
    // + 3 shorts), CTAs & hooks, and polls.
    for (const type of [
      'generate_captions',
      'generate_youtube',
      'generate_ctas',
      'generate_polls',
    ]) {
      try {
        await enqueue(
          type,
          { project_id: project.id },
          { dedupeKey: `${type}:${project.id}`, projectId: project.id, maxAttempts: 2 },
        );
      } catch (err) {
        if (!(err instanceof DuplicateJobError)) throw err;
      }
    }
    return { path: docx.path_display, queued: ['captions', 'youtube', 'ctas', 'polls'] };
  },

  async onFailed(job, message) {
    const parsed = ApprovedPayload.safeParse(job.payload);
    if (!parsed.success) return;
    await updateOne(T.blogVersions, parsed.data.version_id, {
      'Last Error': `Dropbox upload failed: ${message}`,
      Updated: nowIso(),
    });
  },
};
