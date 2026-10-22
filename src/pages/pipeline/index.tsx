import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { useProject, useProjects } from '@/features/projects/api';
import { pipelineSteps, STEP_STATE_META } from '@/features/projects/steps';
import { projectStatus } from '@/lib/status';
import { formatMonth } from '@/lib/time';
import { cn } from '@/lib/utils';
import type { Project } from '@/types/api';

/** How far the project is: a bar, "n of 11 steps", and what is happening now. Loads in the background. */
function Progress({ id }: { id: string }) {
  const { data } = useProject(id);
  if (!data) {
    return (
      <div aria-hidden className="space-y-2">
        <div className="h-2 animate-pulse rounded-full bg-line" />
        <div className="h-4 w-40 animate-pulse rounded bg-line" />
      </div>
    );
  }
  const steps = pipelineSteps(data);
  const done = steps.filter((s) => s.state === 'done').length;
  const now = steps.find((s) => s.state !== 'done');
  const pct = Math.round((done / steps.length) * 100);
  const meta = now ? STEP_STATE_META[now.state] : null;
  return (
    <div className="space-y-2">
      <div
        role="progressbar"
        aria-label="Steps done"
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={done}
        className="h-2 overflow-hidden rounded-full bg-line"
      >
        <div
          className={cn('h-full rounded-full', done === steps.length ? 'bg-success' : 'bg-accent')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="flex flex-wrap items-center gap-x-2 text-sm">
        <span className="font-mono text-xs text-muted">
          {done} of {steps.length} steps
        </span>
        {now && meta ? (
          <span className="text-ink">
            · Now: <span className="font-medium">{now.label}</span>
            <span className="text-muted"> ({meta.label.toLowerCase()})</span>
          </span>
        ) : (
          <span className="flex items-center gap-1 font-medium text-success">
            <CheckCircle2 aria-hidden className="h-4 w-4" />
            All steps done
          </span>
        )}
      </p>
    </div>
  );
}

function ProjectCard({ p }: { p: Project }) {
  return (
    <li>
      <Link
        to={`/projects/${p.id}`}
        className="group grid gap-4 rounded-xl border border-line bg-surface p-5 shadow-sm transition hover:border-accent/40 hover:shadow-md md:grid-cols-[3rem_minmax(0,1fr)_minmax(0,20rem)_1.5rem] md:items-center"
      >
        <span
          aria-hidden
          className="hidden h-12 w-12 place-items-center rounded-full bg-accent-soft font-mono text-sm font-semibold text-accent md:grid"
        >
          {String(p.sequence ?? '').padStart(2, '0')}
        </span>
        <div className="min-w-0 space-y-2">
          <h2 className="line-clamp-2 text-base font-semibold leading-snug group-hover:text-accent">
            <span className="mr-2 font-mono text-xs font-medium text-muted md:hidden">
              #{String(p.sequence ?? '').padStart(2, '0')}
            </span>
            {p.title}
          </h2>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <span>{p.cycle_month ? formatMonth(p.cycle_month.slice(0, 7)) : '—'}</span>
            <span aria-hidden>·</span>
            <StatusBadge meta={projectStatus[p.status]} />
          </div>
          {p.status_detail && <p className="line-clamp-2 text-sm text-muted">{p.status_detail}</p>}
        </div>
        <Progress id={p.id} />
        <ArrowRight
          aria-hidden
          className="hidden h-5 w-5 text-muted transition group-hover:translate-x-1 group-hover:text-accent md:block"
        />
      </Link>
    </li>
  );
}

export default function PipelinePage() {
  const projects = useProjects();
  const list = projects.data ?? [];

  return (
    <>
      <PageHeader
        title="Pipeline"
        description="Every selected topic and where it stands. Open one to review, approve and schedule."
      />
      <div className="mt-6 space-y-4">
        {projects.isLoading && <p className="text-sm text-muted">Loading…</p>}
        {projects.error && (
          <p role="alert" className="text-sm text-danger">
            Couldn’t load projects: {projects.error.message}
          </p>
        )}
        {projects.data && list.length === 0 && (
          <p className="rounded-xl border border-dashed border-line p-8 text-center text-muted">
            No projects yet. Select a topic in the Topic Inbox to start one.
          </p>
        )}
        {list.length > 0 && (
          <p className="text-sm text-muted">
            {list.length} {list.length === 1 ? 'topic' : 'topics'} in the pipeline
          </p>
        )}
        <ul className="space-y-3">
          {list.map((p) => (
            <ProjectCard key={p.id} p={p} />
          ))}
        </ul>
      </div>
    </>
  );
}
