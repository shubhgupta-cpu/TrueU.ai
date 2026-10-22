import { useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/status-badge';
import { Textarea } from '@/components/ui/textarea';
import { versionStatus } from '@/lib/status';
import { formatDateTime } from '@/lib/time';
import type { BlogVersion, ProjectDetail } from '@/types/api';
import { useApproveBlog, useRegenerateBlog, useRejectBlog } from '../api';
import { BlogView } from './blog-view';

/**
 * Blog review (F9): written automatically once the script is approved. The owner approves it
 * (→ Dropbox Blog_Script folder), rejects it, or regenerates it with notes.
 */
export function BlogPanel({ project, timeZone }: { project: ProjectDetail; timeZone: string }) {
  const [viewId, setViewId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [confirm, setConfirm] = useState<'approve' | 'reject' | null>(null);
  const regenerate = useRegenerateBlog(project.id);
  const approve = useApproveBlog(project.id);
  const reject = useRejectBlog(project.id);

  const blogs = project.blogs;
  const latest = blogs[0];
  const viewing: BlogVersion | undefined = blogs.find((b) => b.id === viewId) ?? latest;
  const isLatest = viewing?.id === latest?.id;
  const scriptApproved = project.scripts.some((s) => s.status === 'approved');
  const blogJobs = project.jobs.filter((j) => j.type === 'generate_blog');
  const generating = blogJobs.some((j) => j.status === 'queued' || j.status === 'running');
  const failed = !generating && blogJobs[0]?.status === 'failed' ? blogJobs[0] : null;
  const canDecide =
    !!latest && isLatest && latest.status === 'draft' && !generating && !!latest.blog;
  const error = approve.error ?? reject.error ?? regenerate.error;

  return (
    <section
      className="space-y-5 rounded-lg border border-line bg-surface p-6"
      aria-labelledby="blog-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="blog-heading" className="text-xl font-semibold">
          Blog
        </h2>
        {blogs.length > 1 && (
          <div className="flex items-center gap-2">
            <Label htmlFor="blog-version">Version</Label>
            <Select
              id="blog-version"
              value={viewing?.id}
              onChange={(e) => setViewId(e.target.value)}
            >
              {blogs.map((b) => (
                <option key={b.id} value={b.id}>
                  v{b.version} · {versionStatus[b.status].label}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>

      {!scriptApproved && !latest && (
        <p className="text-sm text-muted">
          The blog is written automatically once the script is approved.
        </p>
      )}
      {generating && (
        <p role="status" className="rounded-md bg-info-soft px-4 py-2 text-sm text-info">
          Writing the blog from the approved script… about a minute. This updates by itself.
        </p>
      )}
      {failed && (
        <p role="alert" className="rounded-md bg-danger-soft px-4 py-2 text-sm text-danger">
          The blog couldn’t be written: {failed.last_error}
        </p>
      )}

      {viewing && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-mono">v{viewing.version}</span>
            <StatusBadge meta={versionStatus[viewing.status]} />
            <span className="text-muted">
              {formatDateTime(viewing.created_at, timeZone)}
              {viewing.prompt_version ? ` · prompt v${viewing.prompt_version}` : ''}
            </span>
          </div>
          {!isLatest && (
            <p className="rounded-md bg-warning-soft px-4 py-2 text-sm text-warning">
              You’re looking at an older version.
            </p>
          )}
          {viewing.status === 'approved' &&
            (viewing.dropbox_path ? (
              <p
                role="status"
                className="rounded-md bg-success-soft px-4 py-2 text-sm text-success"
              >
                Approved and saved to Dropbox:{' '}
                <span className="break-all font-mono text-xs">{viewing.dropbox_path}</span>
              </p>
            ) : viewing.last_error ? (
              <p role="alert" className="rounded-md bg-danger-soft px-4 py-2 text-sm text-danger">
                {viewing.last_error}
              </p>
            ) : (
              <p role="status" className="text-sm text-muted">
                Approved. Saving to the Blog_Script folder…
              </p>
            ))}
          {viewing.regen_notes && (
            <p className="text-sm text-muted">Written with these notes: “{viewing.regen_notes}”</p>
          )}
          <BlogView version={viewing} />
        </>
      )}

      {(latest || (scriptApproved && failed)) && (
        <div className="space-y-3 border-t border-line pt-4">
          <h3 className="font-sans text-xs font-semibold uppercase tracking-wider text-muted">
            Review
          </h3>
          {canDecide && (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setConfirm('approve')} disabled={approve.isPending}>
                Approve blog v{latest!.version}
              </Button>
              <Button
                variant="outline"
                onClick={() => setConfirm('reject')}
                disabled={reject.isPending}
              >
                Reject
              </Button>
            </div>
          )}
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              regenerate.mutate(notes, {
                onSuccess: () => {
                  setNotes('');
                  setViewId(null);
                },
              });
            }}
          >
            <Label htmlFor="blog-notes">Regenerate the blog</Label>
            <Textarea
              id="blog-notes"
              placeholder="What should change? e.g. warmer introduction, mention TrueU.ai twice, shorter sections. Leave empty to simply regenerate."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <Button type="submit" variant="outline" disabled={regenerate.isPending || generating}>
              {generating
                ? 'Writing…'
                : notes.trim()
                  ? 'Regenerate with these changes'
                  : 'Regenerate blog'}
            </Button>
            {latest?.status === 'approved' && (
              <p className="text-xs text-muted">
                This replaces the approved blog (its file leaves Dropbox); the new version needs
                approving again.
              </p>
            )}
          </form>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error.message}
            </p>
          )}
        </div>
      )}

      {latest && (
        <ConfirmDialog
          open={confirm !== null}
          onOpenChange={(open) => !open && setConfirm(null)}
          title={
            confirm === 'approve'
              ? `Approve blog v${latest.version}?`
              : `Reject blog v${latest.version}?`
          }
          description={
            confirm === 'approve'
              ? 'It is saved as blog_APPROVED.docx in the topic’s Blog_Script folder in Dropbox.'
              : 'It won’t be used. You can regenerate a new version any time.'
          }
          confirmLabel={confirm === 'approve' ? 'Approve' : 'Reject'}
          pending={approve.isPending || reject.isPending}
          onConfirm={() => {
            const done = { onSettled: () => setConfirm(null) };
            if (confirm === 'approve') approve.mutate(latest.id, done);
            else reject.mutate({ versionId: latest.id, notes }, done);
          }}
        />
      )}
    </section>
  );
}
