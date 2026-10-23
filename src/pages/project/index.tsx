import { ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  useProject,
  useRetrySetup,
  useScanVideos,
  useSetVideosFolder,
} from '@/features/projects/api';
import { ProjectSections } from '@/features/projects/components/project-sections';
import { PipelineSteps } from '@/features/projects/components/pipeline-steps';
import { PostingWeek } from '@/features/schedule/components/posting-week';
import { useCoreSettings } from '@/features/settings/api';
import { jobStatus, projectStatus } from '@/lib/status';
import { formatMonth } from '@/lib/time';
import type { ProjectDetail } from '@/types/api';

function ExternalAnchor({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-h-touch items-center gap-1 text-accent underline"
    >
      {children}
      <ExternalLink aria-hidden className="h-3 w-3" />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

export default function ProjectPage() {
  const { id = '' } = useParams();
  const project = useProject(id);
  const { timezone } = useCoreSettings();

  if (project.isLoading) return <p className="text-sm text-muted">Loading…</p>;
  if (project.error || !project.data) {
    return (
      <p role="alert" className="text-sm text-danger">
        Couldn’t load the project: {project.error?.message ?? 'not found'}.{' '}
        <Link to="/pipeline" className="underline">
          Back to the Pipeline
        </Link>
      </p>
    );
  }
  const p = project.data;
  const running = p.jobs.filter((j) => j.status === 'queued' || j.status === 'running');

  return (
    <>
      <PageHeader
        title={p.title}
        description={`${p.cycle_month ? formatMonth(p.cycle_month.slice(0, 7)) : ''} · project ${String(p.sequence ?? '').padStart(2, '0')}`}
        actions={
          <Button asChild variant="outline">
            <Link to={`/projects/${p.id}/schedule`}>View schedule</Link>
          </Button>
        }
      />
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <ProjectSections project={p} timeZone={timezone} />
        <aside className="space-y-6 lg:mt-20">
          <section className="space-y-3 rounded-lg border border-line bg-surface p-5">
            <h2 className="font-sans text-xs font-semibold uppercase tracking-wider text-muted">
              Status
            </h2>
            <StatusBadge meta={projectStatus[p.status]} />
            {p.status_detail && <p className="text-sm text-muted">{p.status_detail}</p>}
            {running.length > 0 && (
              <p role="status" className="text-sm text-info">
                Working on it: {running.map((j) => j.type.replace(/_/g, ' ')).join(', ')}…
              </p>
            )}
          </section>
          <section className="space-y-3 rounded-lg border border-line bg-surface p-5">
            <h2 className="font-sans text-xs font-semibold uppercase tracking-wider text-muted">
              Schedule
            </h2>
            <PostingWeek projectId={p.id} />
            <Button asChild variant="outline" className="w-full">
              <Link to={`/projects/${p.id}/schedule#choose-dates`}>Choose dates and times</Link>
            </Button>
          </section>
          <DropboxPanel project={p} />
          <VideosPanel project={p} />
          <section className="space-y-3 rounded-lg border border-line bg-surface p-5">
            <h2 className="font-sans text-xs font-semibold uppercase tracking-wider text-muted">
              Progress
            </h2>
            <PipelineSteps project={p} />
            {p.jobs.length > 0 && (
              <details className="border-t border-line pt-3 text-sm">
                <summary className="min-h-touch cursor-pointer py-2 text-muted">
                  Job log ({p.jobs.length})
                </summary>
                <ul className="space-y-2">
                  {p.jobs.slice(0, 20).map((j) => (
                    <li key={j.id} className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs">{j.type}</span>
                        <StatusBadge meta={jobStatus[j.status]} />
                      </div>
                      {j.last_error && <p className="text-xs text-danger">{j.last_error}</p>}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}

const VIDEO_SLOTS: Array<[string, string]> = [
  ['long_video', 'Long video'],
  ['short_1', 'Short 1'],
  ['short_2', 'Short 2'],
  ['short_3', 'Short 3'],
];

/** The editor's uploads (Dropbox: Long Youtube Final Video, Short Final Video). */
function VideosPanel({ project }: { project: ProjectDetail }) {
  const scan = useScanVideos(project.id);
  const setFolder = useSetVideosFolder(project.id);
  const [folder, setFolderText] = useState(project.videos_folder_path ?? '');
  const other = project.videos.filter((v) => v.role === 'other');
  return (
    <section className="space-y-3 rounded-lg border border-line bg-surface p-5">
      <h2 className="font-sans text-xs font-semibold uppercase tracking-wider text-muted">
        Videos
      </h2>
      <ul className="space-y-1 text-sm">
        {VIDEO_SLOTS.map(([role, label]) => {
          const v = project.videos.find((x) => x.role === role);
          return (
            <li key={role} className="flex justify-between gap-2">
              <span>{label}</span>
              <span className={v ? (v.settled ? 'text-success' : 'text-warning') : 'text-muted'}>
                {v ? (v.settled ? 'Ready' : 'Uploading…') : 'Not uploaded'}
              </span>
            </li>
          );
        })}
      </ul>
      {other.length > 0 && (
        <p role="alert" className="text-sm text-warning">
          Rename so the file says which short it is (for example “Short 2.mp4”):{' '}
          {other.map((v) => v.file_name).join(', ')}
        </p>
      )}
      <Button size="sm" variant="outline" onClick={() => scan.mutate()} disabled={scan.isPending}>
        Check Dropbox now
      </Button>
      <details className="border-t border-line pt-3 text-sm">
        <summary className="min-h-touch cursor-pointer py-2 text-muted">
          Videos in a different folder?
        </summary>
        <label htmlFor="videos-folder" className="block pb-1">
          Dropbox folder with “Long Youtube Final Video” and “Short Final Video” inside
        </label>
        <input
          id="videos-folder"
          value={folder}
          onChange={(e) => setFolderText(e.target.value)}
          placeholder="/Year - 2026/October 2026/Topic folder"
          className="min-h-touch w-full rounded-md border border-line bg-surface px-3 font-mono text-xs"
        />
        <Button
          size="sm"
          className="mt-2"
          disabled={setFolder.isPending || folder === (project.videos_folder_path ?? '')}
          onClick={() => setFolder.mutate(folder)}
        >
          Save folder
        </Button>
        {setFolder.isError && (
          <p role="alert" className="mt-2 text-danger">
            {setFolder.error.message}
          </p>
        )}
      </details>
    </section>
  );
}

function DropboxPanel({ project }: { project: ProjectDetail }) {
  const retry = useRetrySetup(project.id);
  const failed = project.status_detail?.startsWith('Dropbox setup failed');
  return (
    <section className="space-y-3 rounded-lg border border-line bg-surface p-5">
      <h2 className="font-sans text-xs font-semibold uppercase tracking-wider text-muted">
        Dropbox
      </h2>
      {project.dropbox_folder_path ? (
        <>
          <p className="break-all font-mono text-xs">{project.dropbox_folder_path}</p>
          {project.dropbox_shared_link && (
            <ExternalAnchor href={project.dropbox_shared_link}>Open the folder</ExternalAnchor>
          )}
        </>
      ) : (
        <p className="text-sm text-muted">
          {failed ? 'Folder not created yet.' : 'Creating the folder…'}
        </p>
      )}
      {(failed || !project.dropbox_folder_path) && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => retry.mutate()}
          disabled={retry.isPending}
        >
          Retry Dropbox setup
        </Button>
      )}
      {retry.error && (
        <p role="alert" className="text-sm text-danger">
          {retry.error.message}
        </p>
      )}
    </section>
  );
}
