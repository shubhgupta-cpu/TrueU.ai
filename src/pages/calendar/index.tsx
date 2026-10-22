import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/page-header';
import { useProjects } from '@/features/projects/api';
import { PostingWeek } from '@/features/schedule/components/posting-week';
import { useSchedule } from '@/features/schedule/api';
import { ScheduleGrid } from '@/features/schedule/components/schedule-grid';
import type { ScheduledPost } from '@/types/api';

export default function CalendarPage() {
  const { data, isLoading } = useSchedule();
  const projects = useProjects().data ?? [];
  const byProject = new Map<string, ScheduledPost[]>();
  for (const p of data?.posts ?? []) {
    const key = p.project_id ?? '';
    byProject.set(key, [...(byProject.get(key) ?? []), p]);
  }
  return (
    <>
      <PageHeader
        title="Calendar"
        description="Every scheduled post, one 15-day plan per project."
      />
      <section className="mt-6">
        <h2 className="mb-3 text-xl font-semibold">Plan the month</h2>
        <p className="mb-3 text-sm text-muted">
          Choose the week each topic starts posting. Day 1 is that Tuesday; its shorts follow over
          the next 15 days.
        </p>
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {projects.map((p) => (
            <li key={p.id} className="rounded-lg border border-line bg-surface p-4">
              <p className="mb-3 font-medium">{p.title}</p>
              <PostingWeek projectId={p.id} />
            </li>
          ))}
        </ul>
      </section>
      <div className="mt-10 space-y-10">
        {isLoading && <p className="text-sm text-muted">Loading…</p>}
        {data && byProject.size === 0 && (
          <p className="text-sm text-muted">
            Nothing scheduled yet. Open a project and choose Schedule to build its plan.
          </p>
        )}
        {[...byProject].map(([projectId, posts]) => (
          <section key={projectId}>
            <h2 className="mb-3 text-xl font-semibold">
              <Link to={`/projects/${projectId}/schedule`} className="underline">
                {posts[0]!.project_title}
              </Link>
            </h2>
            <ScheduleGrid posts={posts} timezone={data!.timezone} />
          </section>
        ))}
      </div>
    </>
  );
}
