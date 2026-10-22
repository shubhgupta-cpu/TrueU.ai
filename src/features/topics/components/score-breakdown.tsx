import type { CriterionRow } from '../schema';

const DETAIL_LABELS: Record<string, string> = {
  search_phrases: 'Search phrases',
  fear_identified: 'Fear',
  curiosity_gap: 'Curiosity gap',
  person_description: 'Who it’s for',
  deadline_check: 'Deadline check',
  first_conversation_test: 'First conversation test',
};

/** Per-criterion bars (F4.3). The number is always shown next to the bar, never colour alone. */
export function ScoreBreakdown({ criteria }: { criteria: CriterionRow[] }) {
  return (
    <ol className="space-y-4">
      {criteria.map((c) => {
        const pct = Math.round((c.score / c.max) * 100);
        const details = Object.entries(c.details).filter(
          ([k, v]) => k !== 'person_description' && (Array.isArray(v) ? v.length : v),
        );
        return (
          <li key={c.key}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium">{c.label}</span>
              <span className="font-mono text-sm">
                {c.score}
                <span className="text-muted">/{c.max}</span>
              </span>
            </div>
            <div
              className="mt-1 h-2 rounded-full bg-ground"
              role="meter"
              aria-label={`${c.label} score`}
              aria-valuemin={0}
              aria-valuemax={c.max}
              aria-valuenow={c.score}
            >
              <div className="h-2 rounded-full bg-accent" style={{ width: `${pct}%` }} />
            </div>
            {c.reasoning && <p className="mt-1.5 text-sm text-muted">{c.reasoning}</p>}
            {details.length > 0 && (
              <dl className="mt-1.5 space-y-1 text-sm">
                {details.map(([k, v]) => (
                  <div key={k}>
                    <dt className="inline font-medium">{DETAIL_LABELS[k] ?? k}: </dt>
                    <dd className="inline text-muted">
                      {Array.isArray(v) ? v.map((s) => `“${s}”`).join(', ') : v}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            {c.improvements.length > 0 && (
              <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-sm text-ink">
                {c.improvements.map((imp) => (
                  <li key={imp}>{imp}</li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}
