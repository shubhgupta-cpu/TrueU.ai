import { type ReactNode, useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import { Textarea } from '@/components/ui/textarea';
import { itemStatus } from '@/lib/status';
import { formatDateTime } from '@/lib/time';
import { cn } from '@/lib/utils';
import type { ContentItem, ProjectDetail } from '@/types/api';
import { useApproveAllCaptions, useApproveItem, useRegenerateYouTube, useRejectItem } from '../api';

const VIDEOS = [
  { key: 'long_video', label: 'Long video' },
  { key: 'video_1', label: 'Short 1' },
  { key: 'video_2', label: 'Short 2' },
  { key: 'video_3', label: 'Short 3' },
] as const;
type VideoKey = (typeof VIDEOS)[number]['key'];

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wider text-muted">{label}</p>
      {children}
    </div>
  );
}

function VideoCard({
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
  const x = item.extra;
  const title = item.graphic_text ?? '';
  const descLen = item.caption.length;
  const error = approve.error ?? reject.error;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge meta={itemStatus[item.status]} />
        {x.duration && <span className="font-mono text-xs text-muted">{x.duration}</span>}
        {x.seo_notes?.search_volume_estimate && (
          <span className="text-xs text-muted">
            Search volume: {x.seo_notes.search_volume_estimate} · competition:{' '}
            {x.seo_notes.competition ?? '—'}
          </span>
        )}
      </div>

      <Field label="Recommended title">
        <p className="text-lg font-semibold">
          {title}{' '}
          <span
            className={cn(
              'font-mono text-xs font-normal',
              title.length >= 50 && title.length <= 60 ? 'text-muted' : 'text-warning',
            )}
          >
            ({title.length}/60)
          </span>
        </p>
        {x.seo_notes?.recommended_title_rationale && (
          <p className="text-xs text-muted">{x.seo_notes.recommended_title_rationale}</p>
        )}
      </Field>

      {!!x.title_options?.length && (
        <Field label="Other title options">
          <ol className="list-decimal space-y-0.5 pl-5 text-sm">
            {x.title_options
              .filter((o) => o !== title)
              .map((o) => (
                <li key={o}>
                  {o} <span className="font-mono text-xs text-muted">({o.length})</span>
                </li>
              ))}
          </ol>
        </Field>
      )}

      {!!x.thumbnail_text_options?.length && (
        <Field label="Thumbnail text">
          <ul className="flex flex-wrap gap-2">
            {x.thumbnail_text_options.map((t, i) => (
              <li key={i} className="rounded bg-ink px-3 py-2 text-white">
                <span className="block text-sm font-bold">{t.headline}</span>
                {t.subtext && <span className="block text-xs text-white/80">{t.subtext}</span>}
              </li>
            ))}
          </ul>
        </Field>
      )}

      <Field label="Description">
        <p className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded bg-ground p-3 text-sm">
          {item.caption}
        </p>
        <p
          className={cn(
            'font-mono text-xs',
            descLen >= 2000 && descLen <= 5000 ? 'text-muted' : 'text-warning',
          )}
        >
          {descLen} characters (target 2,000–5,000)
        </p>
      </Field>

      {!!x.tags?.length && (
        <Field label={`Tags (${x.tags.length})`}>
          <ul className="flex flex-wrap gap-1.5">
            {x.tags.map((t) => (
              <li key={t} className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs text-accent">
                {t}
              </li>
            ))}
          </ul>
        </Field>
      )}
      {item.hashtags && <p className="font-mono text-sm text-accent">{item.hashtags}</p>}

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
          <Label htmlFor={`yt-reason-${item.id}`}>Why? (optional)</Label>
          <Textarea
            id={`yt-reason-${item.id}`}
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
              Reject
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
    </div>
  );
}

/** YouTube SEO metadata (F10.1): long video + 3 shorts, written from the approved script. */
export function YouTubePanel({ project, timeZone }: { project: ProjectDetail; timeZone: string }) {
  const { set, items } = project.youtube;
  const [video, setVideo] = useState<VideoKey>('long_video');
  const [scope, setScope] = useState<'one' | 'all'>('one');
  const [notes, setNotes] = useState('');
  const [confirmAll, setConfirmAll] = useState(false);
  const regenerate = useRegenerateYouTube(project.id);
  const approveAll = useApproveAllCaptions(project.id);

  const scriptApproved = project.scripts.some((s) => s.status === 'approved');
  const jobs = project.jobs.filter((j) => j.type === 'generate_youtube');
  const generating = jobs.some((j) => j.status === 'queued' || j.status === 'running');
  const failed = !generating && jobs[0]?.status === 'failed' ? jobs[0] : null;
  const current = items.find((i) => i.post === video);
  const pending = items.filter((i) => i.status === 'draft' || i.status === 'needs_edit').length;
  const label = VIDEOS.find((v) => v.key === video)!.label;

  return (
    <section
      className="space-y-5 rounded-lg border border-line bg-surface p-6"
      aria-labelledby="youtube-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="youtube-heading" className="text-xl font-semibold">
          YouTube metadata
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
          Titles, descriptions, tags and thumbnail text for the long video and the 3 shorts are
          written once the blog is approved
          {scriptApproved ? '. You can also generate them now below.' : '.'}
        </p>
      )}
      {generating && (
        <p role="status" className="rounded-md bg-info-soft px-4 py-2 text-sm text-info">
          Writing YouTube metadata for the long video and the 3 shorts… about a minute. This updates
          by itself.
        </p>
      )}
      {failed && (
        <p role="alert" className="rounded-md bg-danger-soft px-4 py-2 text-sm text-danger">
          The YouTube metadata couldn’t be written: {failed.last_error}
        </p>
      )}

      {set && (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-mono">
              {items.filter((i) => i.status === 'approved').length}/{items.length} approved
            </span>
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
          <div
            role="tablist"
            aria-label="Videos"
            className="flex flex-wrap gap-1 border-b border-line"
          >
            {VIDEOS.map((v) => {
              const it = items.find((i) => i.post === v.key);
              return (
                <button
                  key={v.key}
                  type="button"
                  role="tab"
                  aria-selected={v.key === video}
                  onClick={() => setVideo(v.key)}
                  className={cn(
                    'min-h-touch rounded-t-md px-3 text-sm',
                    v.key === video
                      ? 'border-b-2 border-accent font-medium text-ink'
                      : 'text-muted hover:text-ink',
                  )}
                >
                  {v.label}
                  {it && <span className="ml-1 text-xs">· {itemStatus[it.status].label}</span>}
                </button>
              );
            })}
          </div>
          <div role="tabpanel" aria-label={label}>
            {current ? (
              <VideoCard item={current} projectId={project.id} busy={generating} />
            ) : (
              <p className="text-sm text-muted">No metadata for {label} yet.</p>
            )}
          </div>
        </>
      )}

      {/* Before the first set this is a plain "Generate" (e.g. projects approved before this feature). */}
      {(set || scriptApproved) && (
        <form
          className="space-y-2 border-t border-line pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            regenerate.mutate(
              { notes, video: set && scope === 'one' ? video : undefined },
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
                  name="yt-scope"
                  checked={scope === 'one'}
                  onChange={() => setScope('one')}
                />
                Only {label}
              </label>
              <label className="flex min-h-touch items-center gap-2">
                <input
                  type="radio"
                  name="yt-scope"
                  checked={scope === 'all'}
                  onChange={() => setScope('all')}
                />
                All 4 videos (a new set)
              </label>
            </fieldset>
          )}
          <Label htmlFor="yt-notes">What should change? (optional)</Label>
          <Textarea
            id="yt-notes"
            placeholder="e.g. less question-style titles, mention privacy in the first paragraph"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <Button type="submit" variant="outline" disabled={regenerate.isPending || generating}>
            {generating
              ? 'Writing…'
              : !set
                ? 'Generate YouTube metadata'
                : scope === 'one'
                  ? `Regenerate ${label}`
                  : 'Regenerate all 4 videos'}
          </Button>
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
          title={`Approve all ${pending} pending videos?`}
          description="Rejected ones stay rejected."
          confirmLabel="Approve all"
          pending={approveAll.isPending}
          onConfirm={() => approveAll.mutate(set.id, { onSettled: () => setConfirmAll(false) })}
        />
      )}
    </section>
  );
}
