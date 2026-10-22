import { Plus, Sparkles, TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { useCoreSettings } from '@/features/settings/api';
import { useGenerateTopics, usePullTrends, useTopicJobs, useTopics } from '@/features/topics/api';
import { StatCards } from '@/features/topics/components/stat-cards';
import { SubmitTopicDialog } from '@/features/topics/components/submit-topic-dialog';
import { TopicFilterBar } from '@/features/topics/components/topic-filters';
import { TopicList } from '@/features/topics/components/topic-list';
import { defaultFilters, filterTopics, monthOptions, topicStats } from '@/features/topics/logic';
import { cycleMonth, formatDateTime } from '@/lib/time';
import type { Job } from '@/types/api';

/** What the last "Generate with Claude" / "Pull trends" run did, in plain words. */
function jobLine(
  label: string,
  job: Job | null,
  timeZone: string,
): { tone: 'info' | 'ok' | 'error'; text: string } | null {
  if (!job) return null;
  const when = formatDateTime(job.created_at, timeZone);
  if (job.status === 'queued' || job.status === 'running')
    return { tone: 'info', text: `${label}: working on it… (started ${when})` };
  if (job.status === 'failed' || job.status === 'cancelled')
    return {
      tone: 'error',
      text: `${label} failed (${when}): ${job.last_error ?? 'unknown error'}`,
    };
  const r = (job.result ?? {}) as { inserted?: number; failures?: string[] };
  const failures = r.failures?.length ? ` · ${r.failures.length} keyword(s) failed` : '';
  return {
    tone: 'ok',
    text: `${label} (${when}): ${r.inserted ?? 0} new topic(s) added${failures}.`,
  };
}

export default function InboxPage() {
  const topics = useTopics();
  const settings = useCoreSettings();
  const generate = useGenerateTopics();
  const pullTrends = usePullTrends();
  const topicJobs = useTopicJobs();
  const navigate = useNavigate();
  const [filters, setFilters] = useState(defaultFilters);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [params] = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  const all = useMemo(() => topics.data ?? [], [topics.data]);
  const visible = useMemo(
    () => filterTopics(all, filters, settings.timezone),
    [all, filters, settings.timezone],
  );
  const stats = topicStats(all, cycleMonth(new Date(), settings.timezone), settings.videosPerMonth);
  const openTopic = (id: string) => navigate(`/topics/${id}`);

  // Old links (?topic=…) go to the topic's own page.
  const legacy = params.get('topic');
  if (legacy) return <Navigate to={`/topics/${legacy}`} replace />;

  const start = async (fn: () => Promise<unknown>, label: string) => {
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(`${label}: ${err instanceof Error ? err.message : 'failed'}`);
    }
  };
  const lines = [
    jobLine('Generate with Claude', topicJobs.data?.generate_topics ?? null, settings.timezone),
    jobLine('Pull trends', topicJobs.data?.pull_trends ?? null, settings.timezone),
  ].filter((l): l is NonNullable<typeof l> => !!l);

  return (
    <>
      <PageHeader
        title="Topic Inbox"
        description="Every topic, scored against the 60-point rubric. Click a topic to open it."
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => start(() => generate.mutateAsync(), 'Generate with Claude')}
              disabled={generate.isPending}
            >
              <Sparkles aria-hidden className="h-4 w-4" /> Generate with Claude
            </Button>
            <Button
              variant="outline"
              onClick={() => start(() => pullTrends.mutateAsync(), 'Pull trends')}
              disabled={pullTrends.isPending}
            >
              <TrendingUp aria-hidden className="h-4 w-4" /> Pull trends
            </Button>
            <Button onClick={() => setSubmitOpen(true)}>
              <Plus aria-hidden className="h-4 w-4" /> Submit topic
            </Button>
          </>
        }
      />
      {(error || lines.length > 0) && (
        <div className="mt-4 space-y-1 text-sm" aria-live="polite">
          {error && (
            <p role="alert" className="text-danger">
              {error}
            </p>
          )}
          {lines.map((l) => (
            <p
              key={l.text}
              className={
                l.tone === 'error' ? 'text-danger' : l.tone === 'ok' ? 'text-success' : 'text-info'
              }
            >
              {l.text}
            </p>
          ))}
        </div>
      )}

      <div className="mt-6">
        <StatCards stats={stats} />
      </div>

      <div className="mt-6">
        <TopicFilterBar
          filters={filters}
          onChange={setFilters}
          categories={settings.categories}
          months={monthOptions(all, settings.timezone)}
        />
      </div>

      {topics.error && (
        <p role="alert" className="mt-6 text-sm text-danger">
          Couldn’t load topics: {topics.error.message}
        </p>
      )}
      {topics.isLoading ? (
        <p role="status" className="mt-6 text-sm text-muted">
          Loading topics…
        </p>
      ) : (
        <div className="mt-6">
          <p className="mb-2 text-xs text-muted" aria-live="polite">
            <span className="font-mono">{visible.length}</span> of{' '}
            <span className="font-mono">{all.length}</span> topics
          </p>
          <TopicList
            topics={visible}
            selectedId={null}
            onSelect={openTopic}
            scoreMax={settings.scoreMax}
          />
        </div>
      )}

      <SubmitTopicDialog
        open={submitOpen}
        onOpenChange={setSubmitOpen}
        categories={settings.categories}
        onSubmitted={openTopic}
      />
    </>
  );
}
