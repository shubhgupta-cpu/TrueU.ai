import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { PostingWeek } from '@/features/schedule/components/posting-week';
import { useSchedule } from '@/features/schedule/api';
import { ScheduleGrid } from '@/features/schedule/components/schedule-grid';

export default function ProjectSchedulePage() {
  const { id = '' } = useParams();
  const { data } = useSchedule(id);
  const has = (data?.posts.length ?? 0) > 0;
  return (
    <>
      <PageHeader
        title="Schedule"
        description="The Day 1–15 posting plan for this project."
        actions={
          <Link
            to={`/projects/${id}`}
            className="inline-flex min-h-touch items-center text-sm text-accent underline"
          >
            Back to project
          </Link>
        }
      />
      <Card className="mt-6 max-w-md p-4">
        <PostingWeek projectId={id} />
      </Card>
      <div className="mt-6">
        {has && data ? (
          <ScheduleGrid posts={data.posts} timezone={data.timezone} />
        ) : (
          <p className="text-sm text-muted">No schedule yet. Choose a posting week above.</p>
        )}
      </div>
    </>
  );
}
