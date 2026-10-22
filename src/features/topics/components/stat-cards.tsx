import type { TopicStats } from '../logic';

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-5 py-4">
      <dt className="text-xs font-medium uppercase tracking-wider text-muted">{label}</dt>
      <dd className="mt-1 font-mono text-2xl text-ink">{value}</dd>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function StatCards({ stats }: { stats: TopicStats }) {
  const over = stats.selectedThisMonth > stats.monthlySlots;
  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat label="Awaiting score" value={String(stats.awaitingScore)} />
      <Stat label="Qualified" value={String(stats.qualified)} />
      <Stat label="Needs work" value={String(stats.needsWork)} />
      <Stat
        label="Selected this month"
        value={`${stats.selectedThisMonth} / ${stats.monthlySlots}`}
        hint={over ? 'Over the monthly slots' : undefined}
      />
    </dl>
  );
}
