import { StatusBadge } from '@/components/ui/status-badge';
import { cn } from '@/lib/utils';
import type { ProjectDetail } from '@/types/api';
import { pipelineSteps, STEP_STATE_META } from '../steps';

const CIRCLE: Record<string, string> = {
  done: 'bg-success text-white',
  running: 'bg-info text-white',
  failed: 'bg-danger text-white',
  review: 'bg-warning text-white',
  waiting: 'bg-line text-muted',
  todo: 'bg-line text-muted',
};

/** The project's pipeline as numbered steps with a status each (label + colour, never colour alone). */
export function PipelineSteps({
  project,
  compact = false,
}: {
  project: ProjectDetail;
  compact?: boolean;
}) {
  const steps = pipelineSteps(project);
  const done = steps.filter((s) => s.state === 'done').length;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        <span className="font-mono">
          {done}/{steps.length}
        </span>{' '}
        steps done
      </p>
      <ol
        className={cn(
          'space-y-3',
          compact && 'sm:grid sm:grid-cols-2 sm:gap-x-4 sm:space-y-0 sm:gap-y-2',
        )}
      >
        {steps.map((s) => (
          <li key={s.key} className="grid grid-cols-[28px_1fr_auto] items-start gap-x-3">
            <span
              aria-hidden
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full font-mono text-xs',
                CIRCLE[s.state],
              )}
            >
              {s.n}
            </span>
            <div className="min-w-0">
              <span className="block text-sm font-medium leading-7">
                <span className="sr-only">Step {s.n}: </span>
                {s.label}
              </span>
              {s.detail && <p className="break-all text-xs text-muted">{s.detail}</p>}
              {s.error && <p className="text-xs text-danger">{s.error}</p>}
            </div>
            <div className="flex h-7 items-center">
              <StatusBadge meta={STEP_STATE_META[s.state]} />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
