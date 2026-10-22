import { Trash2 } from 'lucide-react';
import { StatusBadge } from '@/components/ui/status-badge';
import { topicSource, topicStatus } from '@/lib/status';
import { cn } from '@/lib/utils';
import type { Topic } from '../api';

export function TopicList({
  topics,
  selectedId,
  onSelect,
  scoreMax,
  picked,
  onPick,
  onPickAll,
  onDelete,
}: {
  topics: Topic[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  scoreMax: number;
  /** Ticked topics (for deleting several at once). */
  picked: ReadonlySet<string>;
  onPick: (id: string) => void;
  /** Tick or untick every topic shown. */
  onPickAll: (checked: boolean) => void;
  /** Delete one topic (asks first). */
  onDelete: (topic: Topic) => void;
}) {
  if (topics.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-line bg-surface p-8 text-center text-sm text-muted">
        No topics match these filters.
      </p>
    );
  }
  const all = topics.every((t) => picked.has(t.id));
  const some = !all && topics.some((t) => picked.has(t.id));
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface">
      <label className="flex min-h-touch cursor-pointer items-center gap-3 border-b border-line bg-ground px-4 text-sm text-muted">
        <input
          type="checkbox"
          checked={all}
          ref={(el) => {
            if (el) el.indeterminate = some;
          }}
          onChange={(e) => onPickAll(e.target.checked)}
          className="h-4 w-4 accent-accent"
        />
        Select all {topics.length} shown
      </label>
      <ul className="divide-y divide-line" aria-label="Topics">
        {topics.map((t) => (
          <li
            key={t.id}
            className={cn(
              'flex items-start',
              picked.has(t.id) && 'bg-accent-soft/60',
              t.id === selectedId && 'bg-accent-soft',
            )}
          >
            <label className="flex min-h-touch w-12 shrink-0 cursor-pointer items-center justify-center self-stretch">
              <input
                type="checkbox"
                checked={picked.has(t.id)}
                onChange={() => onPick(t.id)}
                aria-label={`Select topic ${t.topic_number}: ${t.title}`}
                className="h-4 w-4 accent-accent"
              />
            </label>
            <button
              type="button"
              onClick={() => onSelect(t.id)}
              aria-current={t.id === selectedId ? 'true' : undefined}
              className="flex min-h-touch min-w-0 flex-1 items-start gap-4 py-3 pr-2 text-left hover:bg-ground/70"
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
            <button
              type="button"
              onClick={() => onDelete(t)}
              aria-label={`Delete topic ${t.topic_number}`}
              title="Delete this topic"
              className="grid min-h-touch w-11 shrink-0 place-items-center self-stretch text-muted hover:bg-danger-soft hover:text-danger"
            >
              <Trash2 aria-hidden className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
