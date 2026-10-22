import { ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { StatusBadge } from '@/components/ui/status-badge';
import { useProject } from '@/features/projects/api';
import { ProjectSections } from '@/features/projects/components/project-sections';
import { PipelineSteps } from '@/features/projects/components/pipeline-steps';
import { projectStatus } from '@/lib/status';

/** A selected topic's project, script and blog, reviewable from the Inbox. */
export function TopicScript({ projectId, timeZone }: { projectId: string; timeZone: string }) {
  const project = useProject(projectId);

  if (project.isLoading) return <p className="text-sm text-muted">Loading the script…</p>;
  if (project.error || !project.data) {
    return (
      <p role="alert" className="text-sm text-danger">
        Couldn’t load the script: {project.error?.message ?? 'project not found'}.
      </p>
    );
  }
  const p = project.data;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <StatusBadge meta={projectStatus[p.status]} />
        {p.status_detail && <span className="text-muted">{p.status_detail}</span>}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {p.dropbox_shared_link && (
          <a
            href={p.dropbox_shared_link}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-touch items-center gap-1 text-accent underline"
          >
            Open the Dropbox folder
            <ExternalLink aria-hidden className="h-3 w-3" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        )}
        <Link
          to={`/projects/${p.id}`}
          className="inline-flex min-h-touch items-center text-accent underline"
        >
          Full project page
        </Link>
      </div>
      <div className="rounded-lg border border-line bg-surface p-4">
        <PipelineSteps project={p} compact />
      </div>
      <ProjectSections project={p} timeZone={timeZone} />
    </div>
  );
}
