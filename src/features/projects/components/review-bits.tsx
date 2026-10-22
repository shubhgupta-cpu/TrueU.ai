import { useState, type ReactNode } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import { Textarea } from '@/components/ui/textarea';
import { itemStatus } from '@/lib/status';
import { formatDateTime } from '@/lib/time';
import type { CaptionSet, ContentItem } from '@/types/api';
import { useApproveAllCaptions, useApproveItem, useRejectItem } from '../api';

/** Approve / Reject (with an optional reason) for one Content Item. */
export function ItemDecision({
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
  const error = approve.error ?? reject.error;
  return (
    <div className="space-y-2">
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
          <Label htmlFor={`reason-${item.id}`}>Why? (optional)</Label>
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

/** Section frame for a generated set: status line, progress/failure, approve-all, regenerate form. */
export function SetSection(props: {
  id: string;
  title: string;
  projectId: string;
  timeZone: string;
  set: CaptionSet | null;
  items: ContentItem[];
  generating: boolean;
  failedError: string | null;
  canGenerate: boolean;
  emptyText: string;
  workingText: string;
  notesPlaceholder: string;
  regenerate: {
    mutate: (notes: string, o?: { onSuccess?: () => void }) => void;
    isPending: boolean;
    error: Error | null;
  };
  children: ReactNode;
}) {
  const { set, items } = props;
  const [notes, setNotes] = useState('');
  const [confirmAll, setConfirmAll] = useState(false);
  const approveAll = useApproveAllCaptions(props.projectId);
  const pending = items.filter((i) => i.status === 'draft' || i.status === 'needs_edit').length;
  const approved = items.filter((i) => i.status === 'approved').length;

  return (
    <section
      className="space-y-5 rounded-lg border border-line bg-surface p-6"
      aria-labelledby={`${props.id}-heading`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={`${props.id}-heading`} className="text-xl font-semibold">
          {props.title}
        </h2>
        {set && (
          <span className="text-sm text-muted">
            v{set.version} · {formatDateTime(set.updated_at, props.timeZone)}
            {set.prompt_version ? ` · prompt v${set.prompt_version}` : ''}
          </span>
        )}
      </div>
      {!set && !props.generating && !props.failedError && (
        <p className="text-sm text-muted">{props.emptyText}</p>
      )}
      {props.generating && (
        <p role="status" className="rounded-md bg-info-soft px-4 py-2 text-sm text-info">
          {props.workingText}
        </p>
      )}
      {props.failedError && (
        <p role="alert" className="rounded-md bg-danger-soft px-4 py-2 text-sm text-danger">
          Couldn’t be written: {props.failedError}
        </p>
      )}
      {set && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="font-mono">
            {approved}/{items.length} approved
          </span>
          {pending > 0 && (
            <Button
              size="sm"
              onClick={() => setConfirmAll(true)}
              disabled={approveAll.isPending || props.generating}
            >
              Approve all {pending} pending
            </Button>
          )}
          {set.regen_notes && <span className="text-muted">Written with: “{set.regen_notes}”</span>}
        </div>
      )}
      {set && props.children}

      {(set || props.canGenerate) && (
        <form
          className="space-y-2 border-t border-line pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            props.regenerate.mutate(notes, { onSuccess: () => setNotes('') });
          }}
        >
          <Label htmlFor={`${props.id}-notes`}>
            {set ? 'Regenerate (a new set; approvals start over)' : 'Generate now'}
          </Label>
          <Textarea
            id={`${props.id}-notes`}
            placeholder={props.notesPlaceholder}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <Button
            type="submit"
            variant="outline"
            disabled={props.regenerate.isPending || props.generating}
          >
            {props.generating ? 'Writing…' : set ? 'Regenerate' : 'Generate'}
          </Button>
          {props.regenerate.error && (
            <p role="alert" className="text-sm text-danger">
              {props.regenerate.error.message}
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
          title={`Approve all ${pending} pending?`}
          description="Rejected ones stay rejected."
          confirmLabel="Approve all"
          pending={approveAll.isPending}
          onConfirm={() => approveAll.mutate(set.id, { onSettled: () => setConfirmAll(false) })}
        />
      )}
    </section>
  );
}

export function ItemStatusBadge({ item }: { item: ContentItem }) {
  return <StatusBadge meta={itemStatus[item.status]} />;
}
