import { zodResolver } from '@hookform/resolvers/zod';
import { ExternalLink, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import { Textarea } from '@/components/ui/textarea';
import { topicSource, topicStatus, type Tone } from '@/lib/status';
import { formatDateTime } from '@/lib/time';
import {
  type Topic,
  useDeleteTopic,
  useRegenerateTopic,
  useRescoreTopic,
  useSelectTopic,
  useSetTopicStatus,
  useTopicScores,
  useUpdateTopic,
} from '../api';
import { availableActions, canRegenerate, exceedsMonthlySlots, type TopicStats } from '../logic';
import {
  editTopicSchema,
  type EditTopicValues,
  parseCriteria,
  parseEvaluation,
  parseSourceDetail,
} from '../schema';
import { ScoreBreakdown } from './score-breakdown';
import { TopicScript } from './topic-script';

const RECOMMENDATION_TONE: Record<string, Tone> = {
  GREENLIGHT: 'success',
  REFINE: 'warning',
  REJECT: 'danger',
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line pt-4">
      <h3 className="mb-2 font-sans text-xs font-semibold uppercase tracking-wider text-muted">
        {title}
      </h3>
      {children}
    </section>
  );
}

export function TopicDetail({
  topic,
  topics,
  stats,
  timeZone,
  scoreMax,
  threshold,
  onOpenTopic,
  onDeleted,
}: {
  topic: Topic;
  topics: Topic[];
  stats: TopicStats;
  timeZone: string;
  scoreMax: number;
  threshold: number;
  onOpenTopic: (id: string) => void;
  /** Called after the topic was deleted (e.g. go back to the Inbox). */
  onDeleted?: () => void;
}) {
  const scores = useTopicScores(topic.id, topic.latest_score_id);
  const setStatus = useSetTopicStatus();
  const selectTopic = useSelectTopic();
  const rescore = useRescoreTopic();
  const regenerate = useRegenerateTopic();
  const update = useUpdateTopic();
  const remove = useDeleteTopic();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [offerRescore, setOfferRescore] = useState(false);
  const [confirmOverCap, setConfirmOverCap] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const actions = availableActions(topic.status);
  const latest = scores.data?.[0];
  const criteria = parseCriteria(latest?.criteria);
  const evaluation = parseEvaluation(latest?.evaluation);
  const warnings = Array.isArray(latest?.warnings) ? (latest.warnings as string[]) : [];
  const source = parseSourceDetail(topic.source_detail);
  const original = topic.regenerated_from
    ? topics.find((t) => t.id === topic.regenerated_from)
    : undefined;
  // Newest first: the automatic rewrite plus any made with "Regenerate from suggestions".
  const improvedVersions = topics.filter((t) => t.regenerated_from === topic.id);
  const duplicate = topic.duplicate_of
    ? topics.find((t) => t.id === topic.duplicate_of)
    : undefined;
  const storyboard = evaluation.storyboard ?? {};
  const hasStoryboard = Object.values(storyboard).some((v) => v && v.trim());

  const run = async (fn: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await fn();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  };

  const select = () => run(() => selectTopic.mutateAsync(topic.id));
  const onSelect = () => (exceedsMonthlySlots(stats) ? setConfirmOverCap(true) : select());
  const doRegenerate = () => run(() => regenerate.mutateAsync(topic.id));
  const showRegenerate = canRegenerate(topic, threshold);

  const doRescore = () =>
    run(async () => {
      await rescore.mutateAsync(topic.id);
      setOfferRescore(false);
    });

  return (
    <article
      className="space-y-5 rounded-lg border border-line bg-surface p-6"
      aria-labelledby="topic-title"
    >
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-muted">#{topic.topic_number}</span>
          <StatusBadge meta={topicSource[topic.source]} />
          <StatusBadge meta={topicStatus[topic.status]} />
          {duplicate && (
            <button
              type="button"
              onClick={() => onOpenTopic(duplicate.id)}
              className="min-h-touch text-xs text-warning underline"
            >
              Possible duplicate of #{duplicate.topic_number}
            </button>
          )}
        </div>

        {editing ? (
          <EditTopicForm
            topic={topic}
            onCancel={() => setEditing(false)}
            onSave={(values) =>
              run(async () => {
                await update.mutateAsync({
                  id: topic.id,
                  title: values.title,
                  description: values.description || null,
                });
                setEditing(false);
                setOfferRescore(true);
              })
            }
          />
        ) : (
          <>
            <h2 id="topic-title" className="text-2xl font-semibold leading-snug">
              {topic.title}
            </h2>
            {topic.description && <p className="text-sm text-muted">{topic.description}</p>}
          </>
        )}

        {offerRescore && (
          <div
            role="status"
            className="flex flex-wrap items-center gap-3 rounded-md bg-accent-soft px-4 py-2 text-sm text-accent"
          >
            The topic changed. Its score is for the previous wording.
            <Button size="sm" onClick={doRescore} disabled={rescore.isPending}>
              Rescore now
            </Button>
          </div>
        )}

        {topic.status === 'error' && topic.last_error && (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-3 rounded-md bg-danger-soft px-4 py-2 text-sm text-danger"
          >
            {topic.last_error}
            <Button size="sm" variant="outline" onClick={doRescore} disabled={rescore.isPending}>
              Retry scoring
            </Button>
          </div>
        )}
      </header>

      <div className="flex flex-wrap gap-2">
        {actions.select && (
          <Button onClick={onSelect} disabled={selectTopic.isPending}>
            {selectTopic.isPending ? 'Selecting…' : 'Select'}
          </Button>
        )}
        {actions.save && (
          <Button
            variant="outline"
            onClick={() => run(() => setStatus.mutateAsync({ id: topic.id, status: 'saved' }))}
          >
            Save for later
          </Button>
        )}
        {actions.reject && (
          <Button
            variant="outline"
            onClick={() => run(() => setStatus.mutateAsync({ id: topic.id, status: 'rejected' }))}
          >
            Reject
          </Button>
        )}
        {actions.rescore && topic.status !== 'error' && (
          <Button variant="outline" onClick={doRescore} disabled={rescore.isPending}>
            Rescore
          </Button>
        )}
        {showRegenerate && (
          <Button variant="outline" onClick={doRegenerate} disabled={regenerate.isPending}>
            {regenerate.isPending ? 'Starting…' : 'Regenerate from suggestions'}
          </Button>
        )}
        {actions.edit && !editing && (
          <Button variant="ghost" onClick={() => setEditing(true)}>
            Edit
          </Button>
        )}
        <Button
          variant="ghost"
          className="text-danger hover:bg-danger-soft"
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 aria-hidden className="h-4 w-4" /> Delete
        </Button>
      </div>
      {actionError && (
        <p role="alert" className="text-sm text-danger">
          {actionError}
        </p>
      )}

      {topic.project_id && (
        <Section title="Script, blog & captions">
          <TopicScript projectId={topic.project_id} timeZone={timeZone} />
        </Section>
      )}

      {topic.regenerating && (
        <p role="status" className="rounded-md bg-info-soft px-4 py-2 text-sm text-info">
          Rewriting this topic from its suggestions… The improved version is scored automatically
          and appears in the list in about a minute.
        </p>
      )}

      {(topic.status === 'new' || topic.status === 'scoring') && (
        <p role="status" className="text-sm text-muted">
          Scoring… this updates by itself.
        </p>
      )}

      {original && (
        <Section title="Improved version">
          <p className="text-sm">
            Rewritten from{' '}
            <button
              type="button"
              className="min-h-touch text-accent underline"
              onClick={() => onOpenTopic(original.id)}
            >
              #{original.topic_number}
            </button>{' '}
            ({original.score_total ?? '—'}/{original.score_max ?? scoreMax}) using its improvement
            suggestions.
          </p>
          {topic.regeneration_notes && (
            <p className="mt-1 text-sm text-muted">{topic.regeneration_notes}</p>
          )}
        </Section>
      )}
      {improvedVersions.length > 0 && (
        <Section
          title={
            improvedVersions.length > 1
              ? `Improved versions (${improvedVersions.length})`
              : 'Improved version'
          }
        >
          <p className="mb-1 text-sm text-muted">Rewritten from this topic’s suggestions:</p>
          <ul className="space-y-1 text-sm">
            {improvedVersions.map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  className="min-h-touch text-left text-accent underline"
                  onClick={() => onOpenTopic(v.id)}
                >
                  #{v.topic_number} {v.title}
                </button>{' '}
                <span className="font-mono">
                  ({v.score_total ?? '—'}/{v.score_max ?? scoreMax})
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {latest && (
        <>
          <Section title="Score">
            <div className="flex flex-wrap items-baseline gap-3">
              <span className="font-mono text-4xl">
                {latest.total}
                <span className="text-lg text-muted">/{latest.max_total}</span>
              </span>
              <StatusBadge
                meta={
                  latest.passed
                    ? { label: `Passes (≥ ${latest.threshold})`, tone: 'success' }
                    : { label: `Below ${latest.threshold}`, tone: 'warning' }
                }
              />
              {evaluation.recommendation && (
                <StatusBadge
                  meta={{
                    label: evaluation.recommendation,
                    tone: RECOMMENDATION_TONE[evaluation.recommendation] ?? 'neutral',
                  }}
                />
              )}
              {evaluation.icp_alignment && (
                <StatusBadge
                  meta={{ label: `ICP: ${evaluation.icp_alignment}`, tone: 'neutral' }}
                />
              )}
            </div>
            <p className="mt-1 text-xs text-muted">
              Scored {formatDateTime(latest.created_at, timeZone)} · prompt v{latest.prompt_version}
              {latest.model ? ` · ${latest.model}` : ''}
              {evaluation.trigger_moment ? ` · ${evaluation.trigger_moment}` : ''}
            </p>
            {evaluation.summary && <p className="mt-3 text-sm">{evaluation.summary}</p>}
            {evaluation.icp_alignment_notes && (
              <p className="mt-1 text-sm text-muted">{evaluation.icp_alignment_notes}</p>
            )}
          </Section>

          {criteria.length > 0 && (
            <Section title="Criteria">
              <ScoreBreakdown criteria={criteria} />
            </Section>
          )}

          {(evaluation.top_improvements?.length ?? 0) > 0 && (
            <Section title="Suggestions">
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {evaluation.top_improvements!.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </Section>
          )}

          {hasStoryboard && (
            <Section title="Storyboard">
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                {storyboard.episode_title && (
                  <div className="sm:col-span-2">
                    <dt className="font-medium">Episode title</dt>
                    <dd className="text-muted">{storyboard.episode_title}</dd>
                  </div>
                )}
                {storyboard.shared_value && (
                  <div>
                    <dt className="font-medium">Shared value</dt>
                    <dd className="text-muted">{storyboard.shared_value}</dd>
                  </div>
                )}
                {storyboard.shared_deeper_need && (
                  <div>
                    <dt className="font-medium">Shared deeper need</dt>
                    <dd className="text-muted">{storyboard.shared_deeper_need}</dd>
                  </div>
                )}
                {storyboard.side_a_cares_about && (
                  <div>
                    <dt className="font-medium">Side A cares about</dt>
                    <dd className="text-muted">{storyboard.side_a_cares_about}</dd>
                  </div>
                )}
                {storyboard.side_b_cares_about && (
                  <div>
                    <dt className="font-medium">Side B cares about</dt>
                    <dd className="text-muted">{storyboard.side_b_cares_about}</dd>
                  </div>
                )}
              </dl>
            </Section>
          )}

          {warnings.length > 0 && (
            <Section title={`Format warnings (${warnings.length})`}>
              <details className="text-sm">
                <summary className="min-h-touch cursor-pointer py-2 text-warning">
                  The response didn’t follow every rule in the prompt. Show details
                </summary>
                <ul className="list-disc space-y-1 pl-5 text-muted">
                  {warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </details>
            </Section>
          )}
        </>
      )}

      {topic.source === 'trending' && (source.keyword || source.items?.length) && (
        <Section title="Trend source">
          {source.keyword && (
            <p className="text-sm">
              Keyword: <span className="font-mono">{source.keyword}</span>
            </p>
          )}
          {source.trend_reason && <p className="mt-1 text-sm text-muted">{source.trend_reason}</p>}
          {!!source.items?.length && (
            <ul className="mt-2 space-y-1 text-sm">
              {source.items.map((item) => (
                <li key={`${item.engine}:${item.query}`}>
                  <span className="font-mono text-xs text-muted">{item.engine}</span>{' '}
                  {item.url ? (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-accent underline"
                    >
                      {item.query}
                      <ExternalLink aria-hidden className="h-3 w-3" />
                      <span className="sr-only">(opens in a new tab)</span>
                    </a>
                  ) : (
                    item.query
                  )}
                  {item.value && (
                    <span className="ml-1 font-mono text-xs text-muted">{item.value}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
      {topic.source === 'claude' && source.angle && (
        <Section title="Angle">
          <p className="text-sm text-muted">{source.angle}</p>
        </Section>
      )}

      {topic.owner_notes && (
        <Section title="Owner notes">
          <p className="whitespace-pre-wrap text-sm">{topic.owner_notes}</p>
        </Section>
      )}

      {(scores.data?.length ?? 0) > 1 && (
        <Section title="Score history">
          <ul className="space-y-1 text-sm">
            {scores.data!.slice(1).map((s) => (
              <li key={s.id} className="flex justify-between gap-3">
                <span className="text-muted">{formatDateTime(s.created_at, timeZone)}</span>
                <span className="font-mono">
                  {s.total}/{s.max_total}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <ConfirmDialog
        open={confirmOverCap}
        onOpenChange={setConfirmOverCap}
        title="Select beyond this month’s slots?"
        description={`${stats.selectedThisMonth} of ${stats.monthlySlots} topics are already selected this month.`}
        confirmLabel="Select anyway"
        pending={selectTopic.isPending}
        onConfirm={() => {
          setConfirmOverCap(false);
          void select();
        }}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this topic?"
        description={
          topic.project_id
            ? 'This deletes the topic, its scores and everything generated for it in the app: script, blog, social captions, YouTube metadata, CTAs and polls. The Dropbox folder and its files are kept. This can’t be undone.'
            : 'This deletes the topic and its scores. This can’t be undone.'
        }
        confirmLabel="Delete topic"
        pending={remove.isPending}
        onConfirm={() =>
          run(async () => {
            await remove.mutateAsync(topic.id);
            setConfirmDelete(false);
            onDeleted?.();
          })
        }
      />
    </article>
  );
}

function EditTopicForm({
  topic,
  onSave,
  onCancel,
}: {
  topic: Topic;
  onSave: (values: EditTopicValues) => void;
  onCancel: () => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EditTopicValues>({
    resolver: zodResolver(editTopicSchema),
    defaultValues: { title: topic.title, description: topic.description ?? '' },
  });
  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-3" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="edit-title">Title</Label>
        <Input id="edit-title" aria-invalid={!!errors.title} {...register('title')} />
        {errors.title && <p className="text-sm text-danger">{errors.title.message}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="edit-description">Description</Label>
        <Textarea id="edit-description" {...register('description')} />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isSubmitting}>
          Save
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
