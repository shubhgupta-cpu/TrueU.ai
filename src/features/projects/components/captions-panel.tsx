import { useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import { Textarea } from '@/components/ui/textarea';
import { itemStatus } from '@/lib/status';
import { formatDateTime } from '@/lib/time';
import { cn } from '@/lib/utils';
import type { ContentItem, ProjectDetail } from '@/types/api';
import {
  type Channel as SocialChannel,
  CHANNEL_SPECS,
  CHANNELS,
} from '../../../../server/schemas/captions';
import {
  useApproveAllCaptions,
  useApproveItem,
  useRegenerateCaptions,
  useRejectItem,
} from '../api';

const POST_LABEL: Record<string, string> = {
  image: 'Image post',
  video_1: 'Video 1 · Short 1',
  video_2: 'Video 2 · Short 2',
  video_3: 'Video 3 · Short 3',
};

function PostCard({
  item,
  projectId,
  busy,
}: {
  item: ContentItem;
  projectId: string;
  busy: boolean;
}) {
  const approve = useApproveItem(projectId);
  const reject = useRejectItem(projectId);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const spec =
    item.channel && item.channel in CHANNEL_SPECS
      ? CHANNEL_SPECS[item.channel as SocialChannel]
      : null;
  const [min, max] = spec?.caption ?? [0, Infinity];
  const len = item.caption.length;
  const lenOk = len >= min && len <= max;
  const error = approve.error ?? reject.error;

  return (
    <li className="space-y-3 rounded-md border border-line p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{item.post ? POST_LABEL[item.post] : 'Post'}</span>
        <StatusBadge meta={itemStatus[item.status]} />
      </div>

      {item.graphic_text && (
        <div className="rounded bg-ground p-3 text-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">On the image</p>
          <p className="mt-1 font-medium">“{item.graphic_text}”</p>
          {item.extra.graphic_label && (
            <p className="mt-1 text-xs text-muted">Label: {item.extra.graphic_label}</p>
          )}
          {item.extra.cover_subtext && (
            <p className="mt-1 text-xs text-muted">Subtext: {item.extra.cover_subtext}</p>
          )}
          {item.extra.graphic_points && (
            <p className="mt-1 whitespace-pre-wrap text-xs text-muted">
              Points: {item.extra.graphic_points}
            </p>
          )}
        </div>
      )}
      {!!item.extra.slides?.length && (
        <ol className="space-y-1 text-sm">
          {item.extra.slides.map((s, i) => (
            <li key={i} className="rounded bg-ground px-3 py-2">
              <span className="font-medium">
                Slide {s.number ?? i + 1}: {s.headline}
              </span>
              <span className="block text-muted">{s.body}</span>
            </li>
          ))}
        </ol>
      )}

      <div>
        <p className="whitespace-pre-wrap text-sm">{item.caption}</p>
        <p className={cn('mt-1 font-mono text-xs', lenOk ? 'text-muted' : 'text-warning')}>
          {len} characters (target {min}–{max}){lenOk ? '' : ' · outside the limit'}
        </p>
      </div>
      <p className="font-mono text-sm text-accent">{item.hashtags}</p>

      {item.warnings.length > 0 && (
        <ul className="list-disc space-y-0.5 rounded-md bg-warning-soft py-2 pl-8 pr-3 text-xs text-warning">
          {item.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      {item.status === 'rejected' && item.review_notes && (
        <p className="text-xs text-muted">Rejected: “{item.review_notes}”</p>
      )}

      {rejecting ? (
        <div className="space-y-2">
          <Label htmlFor={`reason-${item.id}`}>Why? (optional, kept with the post)</Label>
          <Textarea
            id={`reason-${item.id}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={reject.isPending}
              onClick={() =>
                reject.mutate(
                  { itemId: item.id, notes: reason },
                  { onSuccess: () => setRejecting(false) },
                )
              }
            >
              Reject post
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {item.status !== 'approved' && (
            <Button
              size="sm"
              onClick={() => approve.mutate(item.id)}
              disabled={approve.isPending || busy}
            >
              Approve
            </Button>
          )}
          {item.status !== 'rejected' && (
            <Button size="sm" variant="outline" onClick={() => setRejecting(true)} disabled={busy}>
              Reject
            </Button>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error.message}
        </p>
      )}
    </li>
  );
}

/**
 * Social captions (F10): written once the blog is approved — 28 posts across 8 channels. Review
 * per post, approve all at once, or regenerate everything / one channel with notes.
 */
export function CaptionsPanel({ project, timeZone }: { project: ProjectDetail; timeZone: string }) {
  const { set, items } = project.captions;
  const [channel, setChannel] = useState<SocialChannel>('linkedin');
  const [notes, setNotes] = useState('');
  const [scope, setScope] = useState<'all' | 'channel'>('channel');
  const [confirmAll, setConfirmAll] = useState(false);
  const regenerate = useRegenerateCaptions(project.id);
  const approveAll = useApproveAllCaptions(project.id);

  const blogApproved = project.blogs.some((b) => b.status === 'approved');
  const jobs = project.jobs.filter((j) => j.type === 'generate_captions');
  const generating = jobs.some((j) => j.status === 'queued' || j.status === 'running');
  const failed = !generating && jobs[0]?.status === 'failed' ? jobs[0] : null;
  const approved = items.filter((i) => i.status === 'approved').length;
  const flagged = items.filter((i) => i.status === 'needs_edit').length;
  const pending = items.filter((i) => i.status === 'draft' || i.status === 'needs_edit').length;
  const shown = items.filter((i) => i.channel === channel);
  const label = CHANNEL_SPECS[channel].label;

  return (
    <section
      className="space-y-5 rounded-lg border border-line bg-surface p-6"
      aria-labelledby="captions-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="captions-heading" className="text-xl font-semibold">
          Social captions
        </h2>
        {set && (
          <span className="text-sm text-muted">
            v{set.version} · {formatDateTime(set.updated_at, timeZone)}
            {set.prompt_version ? ` · prompt v${set.prompt_version}` : ''}
          </span>
        )}
      </div>

      {!set && !generating && !failed && (
        <p className="text-sm text-muted">
          {blogApproved
            ? 'Captions are written right after the approved blog is saved to Dropbox.'
            : 'Captions are written automatically once the blog is approved.'}
        </p>
      )}
      {generating && (
        <p role="status" className="rounded-md bg-info-soft px-4 py-2 text-sm text-info">
          Writing captions for every platform… about 1–2 minutes. This updates by itself.
        </p>
      )}
      {failed && (
        <p role="alert" className="rounded-md bg-danger-soft px-4 py-2 text-sm text-danger">
          Captions couldn’t be written: {failed.last_error}
        </p>
      )}

      {set && (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-mono">
              {approved}/{items.length} approved
            </span>
            {flagged > 0 && (
              <StatusBadge meta={{ label: `${flagged} need a look`, tone: 'warning' }} />
            )}
            {pending > 0 && (
              <Button
                size="sm"
                onClick={() => setConfirmAll(true)}
                disabled={approveAll.isPending || generating}
              >
                Approve all {pending} pending
              </Button>
            )}
          </div>
          {set.warnings.length > 0 && (
            <p className="text-xs text-warning">{set.warnings.join(' · ')}</p>
          )}
          {set.regen_notes && (
            <p className="text-sm text-muted">
              Last rewrite
              {set.regen_scope && set.regen_scope !== 'all'
                ? ` (${CHANNEL_SPECS[set.regen_scope as SocialChannel]?.label ?? set.regen_scope})`
                : ''}
              : “{set.regen_notes}”
            </p>
          )}

          <div
            role="tablist"
            aria-label="Platforms"
            className="flex flex-wrap gap-1 border-b border-line"
          >
            {CHANNELS.map((c) => {
              const list = items.filter((i) => i.channel === c);
              const done = list.filter((i) => i.status === 'approved').length;
              const warn = list.some((i) => i.status === 'needs_edit');
              return (
                <button
                  key={c}
                  type="button"
                  role="tab"
                  aria-selected={c === channel}
                  onClick={() => setChannel(c)}
                  className={cn(
                    'min-h-touch rounded-t-md px-3 text-sm',
                    c === channel
                      ? 'border-b-2 border-accent font-medium text-ink'
                      : 'text-muted hover:text-ink',
                  )}
                >
                  {CHANNEL_SPECS[c].label}{' '}
                  <span className="font-mono text-xs">
                    {done}/{list.length}
                  </span>
                  {warn && <span className="ml-1 text-warning">· check</span>}
                </button>
              );
            })}
          </div>

          <ul role="tabpanel" aria-label={label} className="grid gap-3 xl:grid-cols-2">
            {shown.map((item) => (
              <PostCard key={item.id} item={item} projectId={project.id} busy={generating} />
            ))}
          </ul>
        </>
      )}

      {(set || blogApproved) && (
        <form
          className="space-y-2 border-t border-line pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            regenerate.mutate(
              { notes, channel: set && scope === 'channel' ? channel : undefined },
              { onSuccess: () => setNotes('') },
            );
          }}
        >
          <h3 className="font-sans text-xs font-semibold uppercase tracking-wider text-muted">
            Regenerate
          </h3>
          {set && (
            <fieldset className="flex flex-wrap gap-4 text-sm">
              <legend className="sr-only">What to regenerate</legend>
              <label className="flex min-h-touch items-center gap-2">
                <input
                  type="radio"
                  name="scope"
                  checked={scope === 'channel'}
                  onChange={() => setScope('channel')}
                />
                Only {label}
              </label>
              <label className="flex min-h-touch items-center gap-2">
                <input
                  type="radio"
                  name="scope"
                  checked={scope === 'all'}
                  onChange={() => setScope('all')}
                />
                All platforms (a new set)
              </label>
            </fieldset>
          )}
          <Label htmlFor="caption-notes">What should change? (optional)</Label>
          <Textarea
            id="caption-notes"
            placeholder="e.g. shorter Facebook captions, more questions, less about work"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <Button type="submit" variant="outline" disabled={regenerate.isPending || generating}>
            {generating
              ? 'Writing…'
              : !set
                ? 'Generate captions'
                : scope === 'channel'
                  ? `Regenerate ${label} captions`
                  : 'Regenerate all captions'}
          </Button>
          <p className="text-xs text-muted">
            {set && scope === 'channel'
              ? `Replaces the ${shown.length} ${label} posts, including approved ones.`
              : 'Replaces every post with a new set; approvals start over.'}
          </p>
          {regenerate.error && (
            <p role="alert" className="text-sm text-danger">
              {regenerate.error.message}
            </p>
          )}
        </form>
      )}
      {approveAll.error && (
        <p role="alert" className="text-sm text-danger">
          {approveAll.error.message}
        </p>
      )}

      {set && (
        <ConfirmDialog
          open={confirmAll}
          onOpenChange={setConfirmAll}
          title={`Approve all ${pending} pending posts?`}
          description={
            flagged
              ? `${flagged} of them have warnings (e.g. over the length limit). Rejected posts stay rejected.`
              : 'Rejected posts stay rejected.'
          }
          confirmLabel="Approve all"
          pending={approveAll.isPending}
          onConfirm={() => approveAll.mutate(set.id, { onSettled: () => setConfirmAll(false) })}
        />
      )}
    </section>
  );
}
