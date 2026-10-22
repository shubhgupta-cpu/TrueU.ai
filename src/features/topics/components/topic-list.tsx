import { StatusBadge } from '@/components/ui/status-badge';
import { topicSource, topicStatus } from '@/lib/status';
import { cn } from '@/lib/utils';
import type { Topic } from '../api';

export function TopicList({
  topics,
  selectedId,
  onSelect,
  scoreMax,
}: {
  topics: Topic[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  scoreMax: number;
}) {
  if (topics.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-line bg-surface p-8 text-center text-sm text-muted">
        No topics match these filters.
      </p>
    );
  }
  return (
    <ul
      className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface"
      aria-label="Topics"
    >
      {topics.map((t) => (
        <li key={t.id}>
          <button
            type="button"
            onClick={() => onSelect(t.id)}
            aria-current={t.id === selectedId ? 'true' : undefined}
            className={cn(
              'flex min-h-touch w-full items-start gap-4 px-4 py-3 text-left hover:bg-ground',
              t.id === selectedId && 'bg-accent-soft hover:bg-accent-soft',
            )}
          >
            <span className="w-14 shrink-0 pt-0.5 font-mono text-xs text-muted">
              #{t.topic_number}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-ink">{t.title}</span>
              <span className="mt-1.5 flex flex-wrap gap-1.5">
                <StatusBadge meta={topicSource[t.source]} />
                <StatusBadge meta={topicStatus[t.status]} />
                {t.regenerated_from && (
                  <StatusBadge meta={{ label: 'Improved version', tone: 'accent' }} />
                )}
                {t.duplicate_of && (
                  <StatusBadge meta={{ label: 'Possible duplicate', tone: 'warning' }} />
                )}
                {t.regenerating && <StatusBadge meta={{ label: 'Rewriting…', tone: 'info' }} />}
              </span>
            </span>
            <span className="shrink-0 text-right font-mono text-sm">
              {t.score_total == null ? (
                <span className="text-muted">—</span>
              ) : (
                <>
                  {t.score_total}
                  <span className="text-muted">/{t.score_max ?? scoreMax}</span>
                </>
              )}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
