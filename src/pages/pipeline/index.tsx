import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { useProjects } from '@/features/projects/api';
import { projectStatus } from '@/lib/status';
import { formatMonth } from '@/lib/time';

export default function PipelinePage() {
  const projects = useProjects();

  return (
    <>
      <PageHeader title="Pipeline" description="Every selected topic and where it stands." />
      <div className="mt-6 overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">#</th>
              <th className="px-4 py-3 font-medium">Project</th>
              <th className="px-4 py-3 font-medium">Month</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Latest</th>
            </tr>
          </thead>
          <tbody>
            {projects.isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-muted">
                  Loading…
                </td>
              </tr>
            )}
            {projects.error && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-danger">
                  Couldn’t load projects: {projects.error.message}
                </td>
              </tr>
            )}
            {projects.data?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-muted">
                  No projects yet. Select a topic in the Topic Inbox to start one.
                </td>
              </tr>
            )}
            {projects.data?.map((p) => (
              <tr key={p.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3 font-mono text-muted">
                  {String(p.sequence ?? '').padStart(2, '0')}
                </td>
                <td className="px-4 py-3">
                  <Link to={`/projects/${p.id}`} className="font-medium text-accent underline">
                    {p.title}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted">
                  {p.cycle_month ? formatMonth(p.cycle_month.slice(0, 7)) : '—'}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge meta={projectStatus[p.status]} />
                </td>
                <td className="px-4 py-3 text-muted">{p.status_detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
