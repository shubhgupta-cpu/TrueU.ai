import { AlertTriangle, ArrowRight, Check, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { useProject, useProjects } from '@/features/projects/api';
import { pipelineSteps, STEP_STATE_META, type Step } from '@/features/projects/steps';
import { projectStatus } from '@/lib/status';
import { formatMonth } from '@/lib/time';
import { cn } from '@/lib/utils';
import type { Project } from '@/types/api';

/** Which panel of the project page a step lives in (steps before the script have none). */
const SECTION: Record<string, string> = {
  script: 'script',
  script_approval: 'script',
  blog: 'blog',
  blog_approval: 'blog',
  captions: 'captions',
  youtube: 'youtube',
  ctas: 'ctas',
  polls: 'polls',
};

const hrefOf = (projectId: string, step: Step) =>
  `/projects/${projectId}${SECTION[step.key] ? `#section-${SECTION[step.key]}` : ''}`;

const CARD: Record<Step['state'], string> = {
  done: '',
  running: 'border-info/40 bg-info-soft/50',
  review: 'border-warning/50 bg-warning-soft',
  failed: 'border-danger/50 bg-danger-soft',
  waiting: '',
  todo: '',
};

const SEGMENT: Record<Step['state'], string> = {
  done: 'bg-success',
  running: 'bg-info',
  review: 'bg-warning',
  failed: 'bg-danger',
  waiting: 'bg-line',
  todo: 'bg-line',
};

/** A step that needs attention or is running: a full card. */
function ActiveCard({ step, projectId }: { step: Step; projectId: string }) {
  return (
    <li>
      <Link
        to={hrefOf(projectId, step)}
        className={cn(
          'flex h-full items-start gap-3 rounded-lg border p-3 transition hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent',
          CARD[step.state],
        )}
      >
        <span
          aria-hidden
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface font-mono text-xs font-semibold shadow-sm"
        >
          {step.n}
        </span>
        <span className="min-w-0 flex-1 space-y-1">
          <span className="block text-sm font-semibold leading-snug">
            <span className="sr-only">Step {step.n}: </span>
            {step.label}
          </span>
          {step.detail && (
            <span className="block break-words text-xs text-muted">{step.detail}</span>
          )}
          {step.error && <span className="block text-xs text-danger">{step.error}</span>}
          <StatusBadge meta={STEP_STATE_META[step.state]} />
        </span>
      </Link>
    </li>
  );
}

/** A finished or not-yet-started step: one small pill, so a long pipeline stays short. */
function Pill({ step, projectId }: { step: Step; projectId: string }) {
  const done = step.state === 'done';
  return (
    <li>
      <Link
        to={hrefOf(projectId, step)}
        title={`${step.label}${step.detail ? ` · ${step.detail}` : ''} (${STEP_STATE_META[step.state].label})`}
        className={cn(
          'inline-flex min-h-[32px] items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition hover:border-accent',
          done
            ? 'border-success/30 bg-success-soft/50 text-success'
            : 'border-dashed border-line text-muted',
        )}
      >
        {done ? (
          <Check aria-hidden className="h-3.5 w-3.5" />
        ) : (
          <span aria-hidden className="font-mono">
            {step.n}
          </span>
        )}
        <span className="sr-only">
          Step {step.n}, {STEP_STATE_META[step.state].label}:{' '}
        </span>
        {step.label}
      </Link>
    </li>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-bold uppercase tracking-wider text-muted">{title}</h3>
      {children}
    </div>
  );
}

/** One topic: a header with progress (always visible) and, when open, its steps grouped by state. */
function TopicBoard({ p }: { p: Project }) {
  const { data } = useProject(p.id);
  const steps = data ? pipelineSteps(data) : null;
  const [toggled, setToggled] = useState<boolean | null>(null);
  const done = steps?.filter((s) => s.state === 'done') ?? [];
  const active = steps?.filter((s) => ['running', 'review', 'failed'].includes(s.state)) ?? [];
  const todo = steps?.filter((s) => ['todo', 'waiting'].includes(s.state)) ?? [];
  const attention = active.filter((s) => s.state !== 'running').length;
  // Open by default only when something needs the owner or is running; finished topics stay folded.
  const open = toggled ?? active.length > 0;
  const pct = steps ? Math.round((done.length / steps.length) * 100) : 0;

  return (
    <article className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span
          aria-hidden
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-soft font-mono text-sm font-semibold text-accent"
        >
          {String(p.sequence ?? '').padStart(2, '0')}
        </span>
        <div className="min-w-0 flex-1 basis-60 space-y-0.5">
          <h2 className="truncate text-base font-bold" title={p.title}>
            {p.title}
          </h2>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <span>{p.cycle_month ? formatMonth(p.cycle_month.slice(0, 7)) : '—'}</span>
            <span aria-hidden>·</span>
            <StatusBadge meta={projectStatus[p.status]} />
            {attention > 0 && (
              <span className="inline-flex items-center gap-1 font-medium text-warning">
                <AlertTriangle aria-hidden className="h-4 w-4" />
                {attention} need{attention === 1 ? 's' : ''} you
              </span>
            )}
          </div>
        </div>
        {steps ? (
          <div className="w-full space-y-1 sm:w-60">
            <div
              role="progressbar"
              aria-label="Steps done"
              aria-valuemin={0}
              aria-valuemax={steps.length}
              aria-valuenow={done.length}
              className="flex h-2 gap-0.5"
            >
              {steps.map((s) => (
                <span key={s.key} className={cn('h-full flex-1 rounded-sm', SEGMENT[s.state])} />
              ))}
            </div>
            <p className="font-mono text-xs text-muted">
              {done.length} of {steps.length} steps done · {pct}%
            </p>
          </div>
        ) : (
          <div aria-hidden className="h-8 w-60 animate-pulse rounded bg-line" />
        )}
        <Link
          to={`/projects/${p.id}`}
          className="inline-flex min-h-touch items-center gap-1 rounded-lg border border-line px-3 text-sm font-medium hover:border-accent hover:text-accent"
        >
          Open <ArrowRight aria-hidden className="h-4 w-4" />
        </Link>
        <button
          type="button"
          onClick={() => setToggled(!open)}
          aria-expanded={open}
          aria-label={open ? 'Hide steps' : 'Show steps'}
          disabled={!steps}
          className="grid min-h-touch min-w-touch place-items-center rounded-lg border border-line hover:border-accent disabled:opacity-50"
        >
          <ChevronDown aria-hidden className={cn('h-4 w-4 transition', open && 'rotate-180')} />
        </button>
      </header>

      {steps && open && (
        <div className="mt-4 space-y-4 border-t border-line pt-4">
          {active.length > 0 && (
            <Group title="Working on / needs you">
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {active.map((s) => (
                  <ActiveCard key={s.key} step={s} projectId={p.id} />
                ))}
              </ul>
            </Group>
          )}
          {done.length > 0 && (
            <Group title={`Done (${done.length})`}>
              <ul className="flex flex-wrap gap-2">
                {done.map((s) => (
                  <Pill key={s.key} step={s} projectId={p.id} />
                ))}
              </ul>
            </Group>
          )}
          {todo.length > 0 && (
            <Group title={`Still to do (${todo.length})`}>
              <ul className="flex flex-wrap gap-2">
                {todo.map((s) => (
                  <Pill key={s.key} step={s} projectId={p.id} />
                ))}
              </ul>
            </Group>
          )}
        </div>
      )}
    </article>
  );
}

export default function PipelinePage() {
  const projects = useProjects();
  const list = projects.data ?? [];

  return (
    <>
      <PageHeader
        title="Pipeline"
        description="Every selected topic and how far it is. Open a topic's steps to see what is done, what is happening now and what is still to do."
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
        {list.map((p) => (
          <TopicBoard key={p.id} p={p} />
        ))}
      </div>
    </>
  );
}
