import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
          <Button asChild variant="outline">
            <Link to={`/projects/${id}`}>
              <ArrowLeft aria-hidden className="h-4 w-4" />
              Back to project
            </Link>
          </Button>
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
