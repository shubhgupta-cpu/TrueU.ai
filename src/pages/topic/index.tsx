import { ArrowLeft } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useCoreSettings } from '@/features/settings/api';
import { useTopics } from '@/features/topics/api';
import { TopicDetail } from '@/features/topics/components/topic-detail';
import { topicStats } from '@/features/topics/logic';
import { cycleMonth } from '@/lib/time';

/** One topic on its own page: score, actions and — once selected — everything generated for it. */
export default function TopicPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const topics = useTopics();
  const settings = useCoreSettings();
  const all = topics.data ?? [];
  const topic = all.find((t) => t.id === id);
  const stats = topicStats(all, cycleMonth(new Date(), settings.timezone), settings.videosPerMonth);

  return (
    <div className="space-y-4">
      <Link
        to="/inbox"
        className="inline-flex min-h-touch items-center gap-1 text-sm text-accent underline"
      >
        <ArrowLeft aria-hidden className="h-4 w-4" /> Topic Inbox
      </Link>
      {topics.isLoading && <p className="text-sm text-muted">Loading…</p>}
      {topics.error && (
        <p role="alert" className="text-sm text-danger">
          Couldn’t load the topic: {topics.error.message}
        </p>
      )}
      {!topics.isLoading && !topics.error && !topic && (
        <p className="rounded-lg border border-dashed border-line bg-surface p-8 text-center text-sm text-muted">
          This topic doesn’t exist any more (it may have been deleted).
        </p>
      )}
      {topic && (
        <TopicDetail
          key={topic.id}
          topic={topic}
          topics={all}
          stats={stats}
          timeZone={settings.timezone}
          scoreMax={settings.scoreMax}
          threshold={settings.scoreThreshold}
          onOpenTopic={(other) => navigate(`/topics/${other}`)}
          onDeleted={() => navigate('/inbox')}
        />
      )}
    </div>
  );
}
