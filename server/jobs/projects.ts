// Project jobs (architecture.md §3):
// - setup_project: the Dropbox folder tree + shared link (F5.2, F5.3), then exports any script that
//   was generated before the folder existed.
// - generate_script: runs script_generate and saves a new Script Versions record (F6.1), then
//   writes it to the project's 01_Script folder as .docx and .md (F6.4).
// - export_script: (re)writes one version's files to Dropbox. Separate from generation so a Dropbox
//   hiccup never pays for a second Claude call.
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
import { runPrompt } from '../claude.js';
import { deleteFiles, ensureFolders, sharedLink, upload } from '../dropbox.js';
import { activity } from '../log.js';
import { approvedFileName, layoutFrom, projectFolder, scriptFileName } from '../paths.js';
import { loadProject, setProjectStatus } from '../repo/projects.js';
import { loadTopic } from '../repo/topics.js';
import { Script, scriptWarnings } from '../schemas/script.js';
import { scenes, scriptDocx, scriptMarkdown } from '../script-doc.js';
import { getSettings } from '../settings.js';
import { localDate, topicText } from '../topics.js';
import type { JobHandler } from './handlers.js';
import { DuplicateJobError, enqueue } from './queue.js';
import { PermanentJobError } from './rules.js';
import { payload } from './topics.js';

const ProjectPayload = z.object({ project_id: z.string().min(1) });

/** Every script version of a project (Airtable records), newest first. */
export async function scriptVersions(projectId: string): Promise<AtRecord[]> {
  const ids =
    ((await get(T.projects, projectId))?.fields['Script Versions'] as string[] | undefined) ?? [];
  if (!ids.length) return [];
  const rows = await list(T.scriptVersions, { filterByFormula: byIds(ids) });
  return rows.sort((a, b) => (num(b.fields, 'Version') ?? 0) - (num(a.fields, 'Version') ?? 0));
}

/** The .docx and .md paths a version was written to (the record stores the .docx path). */
function versionFiles(rec: AtRecord): string[] {
  const docx = str(rec.fields, 'Dropbox Path');
  return docx ? [docx, docx.replace(/\.docx$/i, '.md')] : [];
}

/**
 * The prompt asks for topic, episode_title and shared_value. The last two come from the topic
 * score's storyboard (filled for passing scores); otherwise the title stands in and Claude picks
 * the shared value.
 */
export function episodeInput(title: string, topic: string, storyboard: unknown) {
  const sb = (storyboard && typeof storyboard === 'object' ? storyboard : {}) as Record<
    string,
    unknown
  >;
  const pick = (k: string) => (typeof sb[k] === 'string' ? (sb[k] as string).trim() : '');
  return {
    topic,
    episode_title: pick('episode_title') || title,
    shared_value:
      pick('shared_value') || 'Not set. Choose the one shared value that best fits this topic.',
  };
}

function queueFirstScript(projectId: string) {
  return enqueueQuietly(
    'generate_script',
    { project_id: projectId },
    {
      dedupeKey: `generate_script:${projectId}`,
      projectId,
      maxAttempts: 2,
    },
  );
}

async function mustLoadProject(id: string) {
  const project = await loadProject(id);
  if (!project) throw new PermanentJobError(`Project ${id} not found`);
  return project;
}

async function enqueueQuietly(...args: Parameters<typeof enqueue>) {
  try {
    await enqueue(...args);
  } catch (err) {
    if (!(err instanceof DuplicateJobError)) throw err;
  }
}

export const setupProject: JobHandler = {
  async run(job) {
    const { project_id } = payload(ProjectPayload, job.payload);
    const project = await mustLoadProject(project_id);
    const { dropbox, timezone } = await getSettings(['dropbox', 'timezone'] as const);
    const layout = layoutFrom(dropbox);

    // /Year - 2026/October 2026/<Topic name>/… — year and month folders are created when missing.
    const folder =
      project.dropbox_folder_path ??
      projectFolder(
        layout,
        project.cycle_month ?? `${localDate(new Date(), timezone).slice(0, 7)}-01`,
        project.title,
      );
    const folderId = await ensureFolders([
      folder,
      ...layout.subfolders.map((s) => `${folder}/${s}`),
    ]);
    const link = await sharedLink(folder);

    await updateOne(T.projects, project.id, {
      'Dropbox Folder Path': folder,
      'Dropbox Folder ID': folderId,
      'Dropbox Shared Link': link,
      'Status Detail':
        project.status === 'selected'
          ? 'Dropbox folder ready. Writing the script…'
          : project.status_detail,
      Updated: nowIso(),
    });
    await activity({
      event: 'dropbox_folders_created',
      projectId: project.id,
      details: { folder, folder_id: folderId },
    });

    // F5.4: the first script is generated once the folder exists. A script generated earlier
    // (setup failed, then was retried) is written to the folder now.
    const scripts =
      ((await get(T.projects, project.id))?.fields['Script Versions'] as string[] | undefined) ??
      [];
    if (!scripts.length) await queueFirstScript(project.id);
    for (const id of scripts) {
      const v = await get(T.scriptVersions, id);
      if (v && !str(v.fields, 'Dropbox Path')) {
        await enqueueQuietly(
          'export_script',
          { version_id: id },
          { dedupeKey: `export_script:${id}`, projectId: project.id },
        );
      }
    }
    return { folder, folder_id: folderId, shared_link: link };
  },

  async onFailed(job, message) {
    const parsed = ProjectPayload.safeParse(job.payload);
    if (!parsed.success) return;
    const project = await loadProject(parsed.data.project_id);
    if (project) {
      await updateOne(T.projects, project.id, {
        'Status Detail': `Dropbox setup failed: ${message}. The script is still generated; retry the setup to save it to Dropbox.`,
        Updated: nowIso(),
      });
      // Don't hold the script back for Dropbox: it's saved in Airtable and exported on retry.
      const scripts = (await get(T.projects, project.id))?.fields['Script Versions'] as
        | string[]
        | undefined;
      if (!scripts?.length) await queueFirstScript(project.id);
    }
  },
};

const GeneratePayload = ProjectPayload.extend({ notes: z.string().optional() });

export const generateScript: JobHandler = {
  async run(job) {
    const { project_id, notes } = payload(GeneratePayload, job.payload);
    const project = await mustLoadProject(project_id);
    const topic = project.topic_id ? await loadTopic(project.topic_id) : null;
    if (!topic) throw new PermanentJobError('The project has no topic');

    const score = topic.latest_score_id ? await get(T.topicScores, topic.latest_score_id) : null;
    const evaluation = score
      ? jsonField<Record<string, unknown>>(score.fields, 'Evaluation', {})
      : {};
    const { timezone } = await getSettings(['timezone'] as const);

    const run = await runPrompt(
      'script_generate',
      {
        ...episodeInput(topic.title, topicText(topic), evaluation['storyboard']),
        score_reasoning: (score && str(score.fields, 'Summary')) ?? '',
        notes: notes ?? '',
        current_date: localDate(new Date(), timezone),
      },
      Script,
      { jobId: job.id, projectId: project.id },
    );

    const earlier = await scriptVersions(project.id);
    const version = (num(earlier[0]?.fields ?? {}, 'Version') ?? 0) + 1;

    const warnings = scriptWarnings(run.data);
    const scoreText = score
      ? `${num(score.fields, 'Total')}/${num(score.fields, 'Max Total')}`
      : null;
    const markdown = scriptMarkdown(run.data, {
      projectTitle: project.title,
      version,
      score: scoreText,
      generatedAt: localDate(new Date(), timezone),
    });
    const now = nowIso();
    const rec = await createOne(T.scriptVersions, {
      Name: `${project.title} · v${version}`,
      Project: [project.id],
      Version: version,
      Status: 'draft',
      Title: run.data.episode_metadata.episode_title,
      'Script JSON': toJson(run.data),
      Warnings: toJson(warnings),
      Scenes: toJson(scenes(run.data)),
      Storyboard: toJson(run.data.narrator_backgrounds),
      'B-roll': toJson(
        scenes(run.data)
          .filter((x) => x.b_roll)
          .map((x) => ({ scene: x.n, b_roll: x.b_roll })),
      ),
      Clips: toJson(run.data.clip_timestamps),
      'Body Markdown': markdown,
      Source: 'claude',
      'Regen Scope': 'full',
      'Regen Notes': notes,
      'Prompt Key': run.prompt.key,
      'Prompt Version': run.prompt.version,
      Created: now,
      Updated: now,
    });

    // The new version replaces the earlier ones, including an approved one (its approval lapses).
    const revoked = earlier.some((r) => str(r.fields, 'Status') === 'approved');
    const stale = earlier.filter((r) => str(r.fields, 'Status') !== 'superseded');
    if (stale.length) {
      await Promise.all(
        stale.map((r) =>
          updateOne(T.scriptVersions, r.id, { Status: 'superseded', Updated: nowIso() }),
        ),
      );
    }

    const fresh = await mustLoadProject(project.id);
    await setProjectStatus(
      fresh,
      'script_draft',
      fresh.dropbox_folder_path
        ? `Script v${version} ready. Saving it to Dropbox…`
        : `Script v${version} ready. Waiting for the Dropbox folder.`,
    );
    await activity({
      event: 'script_generated',
      projectId: project.id,
      details: {
        version,
        version_id: rec.id,
        warnings: warnings.length,
        notes: notes ?? null,
        approval_revoked: revoked,
      },
    });

    if (fresh.dropbox_folder_path) {
      await enqueueQuietly(
        'export_script',
        { version_id: rec.id },
        { dedupeKey: `export_script:${rec.id}`, projectId: project.id },
      );
    }
    return { version_id: rec.id, version };
  },

  async onFailed(job, message) {
    const parsed = ProjectPayload.safeParse(job.payload);
    if (!parsed.success) return;
    const project = await loadProject(parsed.data.project_id);
    if (project) await setProjectStatus(project, 'error', `Script generation failed: ${message}`);
  },
};

const ExportPayload = z.object({ version_id: z.string().min(1) });

export const exportScript: JobHandler = {
  async run(job) {
    const { version_id } = payload(ExportPayload, job.payload);
    const rec = await get(T.scriptVersions, version_id);
    if (!rec) throw new PermanentJobError(`Script version ${version_id} not found`);
    const projectId = (rec.fields['Project'] as string[] | undefined)?.[0];
    const project = projectId ? await mustLoadProject(projectId) : null;
    if (!project?.dropbox_folder_path)
      throw new Error('The project’s Dropbox folder isn’t ready yet');

    const parsed = Script.safeParse(jsonField(rec.fields, 'Script JSON', null));
    if (!parsed.success) {
      throw new PermanentJobError(
        'This version has no readable Script JSON in Airtable, so it can’t be exported',
      );
    }
    const script = parsed.data;
    const version = num(rec.fields, 'Version') ?? 1;
    const { timezone, dropbox } = await getSettings(['timezone', 'dropbox'] as const);
    const scriptDir = layoutFrom(dropbox).script_folder;
    const meta = {
      projectTitle: project.title,
      version,
      generatedAt: localDate(new Date(str(rec.fields, 'Created') ?? Date.now()), timezone),
    };
    const dir = `${project.dropbox_folder_path}/${scriptDir}`;
    const docx = await upload(
      `${dir}/${scriptFileName(version, 'docx')}`,
      await scriptDocx(script, meta),
    );
    await upload(
      `${dir}/${scriptFileName(version, 'md')}`,
      new TextEncoder().encode(scriptMarkdown(script, meta)),
    );

    await updateOne(T.scriptVersions, version_id, {
      'Dropbox Path': docx.path_display,
      'Dropbox Rev': docx.rev,
      'Last Error': null,
      Updated: nowIso(),
    });

    // Only the current script stays in the folder: remove the files of older versions (they stay
    // in Airtable as history, and in Dropbox's deleted files). A newer version is never touched.
    const all = await scriptVersions(project.id);
    const removed: string[] = [];
    for (const old of all.filter(
      (r) => r.id !== version_id && (num(r.fields, 'Version') ?? 0) < version,
    )) {
      const files = versionFiles(old);
      if (!files.length) continue;
      await deleteFiles(files);
      await updateOne(T.scriptVersions, old.id, {
        'Dropbox Path': null,
        'Dropbox Rev': null,
        Updated: nowIso(),
      });
      removed.push(...files);
    }
    // A new draft means the earlier approval lapsed: remove the APPROVED copy too.
    if (str(rec.fields, 'Status') !== 'approved') {
      const approved = `${dir}/${approvedFileName('docx')}`;
      await deleteFiles([approved, approved.replace(/\.docx$/, '.md')]);
    }

    await setProjectStatus(
      project,
      project.status,
      `Script v${version} saved to Dropbox (${scriptDir}/${scriptFileName(version, 'docx')}).`,
    );
    await activity({
      event: 'script_exported',
      projectId: project.id,
      details: { version, path: docx.path_display, removed },
    });
    return { path: docx.path_display, rev: docx.rev };
  },

  async onFailed(job, message) {
    const parsed = ExportPayload.safeParse(job.payload);
    if (!parsed.success) return;
    await updateOne(T.scriptVersions, parsed.data.version_id, {
      'Last Error': `Dropbox upload failed: ${message}`,
      Updated: nowIso(),
    });
  },
};

const ApprovedPayload = z.object({ version_id: z.string().min(1) });

/**
 * After the owner approves a version (F6.4): write Script/script_APPROVED.docx and .md.
 * Then queues the blog. TODO: editor handoff (how the editor receives the approved script is not decided yet).
 */
export const onScriptApproved: JobHandler = {
  async run(job) {
    const { version_id } = payload(ApprovedPayload, job.payload);
    const rec = await get(T.scriptVersions, version_id);
    if (!rec) throw new PermanentJobError(`Script version ${version_id} not found`);
    if (str(rec.fields, 'Status') !== 'approved')
      return { skipped: 'no longer the approved version' };
    const projectId = (rec.fields['Project'] as string[] | undefined)?.[0];
    const project = projectId ? await mustLoadProject(projectId) : null;
    if (!project?.dropbox_folder_path)
      throw new Error('The project’s Dropbox folder isn’t ready yet');

    const parsed = Script.safeParse(jsonField(rec.fields, 'Script JSON', null));
    if (!parsed.success)
      throw new PermanentJobError('This version has no readable Script JSON in Airtable');
    const version = num(rec.fields, 'Version') ?? 1;
    const { timezone, dropbox } = await getSettings(['timezone', 'dropbox'] as const);
    const scriptDir = layoutFrom(dropbox).script_folder;
    const meta = {
      projectTitle: project.title,
      version,
      generatedAt: localDate(new Date(str(rec.fields, 'Created') ?? Date.now()), timezone),
    };
    const dir = `${project.dropbox_folder_path}/${scriptDir}`;
    const docx = await upload(
      `${dir}/${approvedFileName('docx')}`,
      await scriptDocx(parsed.data, meta),
      'overwrite',
    );
    await upload(
      `${dir}/${approvedFileName('md')}`,
      new TextEncoder().encode(scriptMarkdown(parsed.data, meta)),
      'overwrite',
    );

    const fresh = await mustLoadProject(project.id);
    await setProjectStatus(
      fresh,
      fresh.status,
      `Script v${version} approved and saved as ${scriptDir}/${approvedFileName('docx')}.`,
    );
    await activity({
      event: 'script_approved_files_written',
      projectId: project.id,
      details: { version, path: docx.path_display },
    });

    // F9: the blog is written from the approved script.
    await enqueueQuietly(
      'generate_blog',
      { project_id: project.id },
      {
        dedupeKey: `generate_blog:${project.id}`,
        projectId: project.id,
        maxAttempts: 2,
      },
    );
    return { path: docx.path_display, blog_queued: true };
  },
};
