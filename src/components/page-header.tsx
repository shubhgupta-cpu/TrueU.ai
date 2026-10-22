import type { ReactNode } from 'react';

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
      <div>
        <h1 className="text-3xl font-semibold">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </header>
  );
}

/** Placeholder body for routes that are built in later phases. */
export function ComingInPhase({ phase }: { phase: number }) {
  return (
    <div className="mt-8 rounded-lg border border-dashed border-line bg-surface p-10 text-center text-sm text-muted">
      Built in Phase {phase} (see docs/build-plan.md).
    </div>
  );
}
