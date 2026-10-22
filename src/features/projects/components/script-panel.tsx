import { useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/status-badge';
import { Textarea } from '@/components/ui/textarea';
import { versionStatus } from '@/lib/status';
import { formatDateTime } from '@/lib/time';
import type { ProjectDetail, ScriptVersion } from '@/types/api';
import { useApproveScript, useExportScript, useRegenerateScript } from '../api';
import { ScriptView } from './script-view';

/**
 * Script review (F6, F7.5): read the newest version, then approve it or request changes. Requesting
 * changes writes a new version with the notes; the old one's files leave the Dropbox folder.
 */
export function ScriptPanel({ project, timeZone }: { project: ProjectDetail; timeZone: string }) {
  const [viewId, setViewId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [confirmApprove, setConfirmApprove] = useState(false);
  const regenerate = useRegenerateScript(project.id);
  const approve = useApproveScript(project.id);
  const exportScript = useExportScript(project.id);

  const scripts = project.scripts;
  const latest = scripts[0];
  const viewing: ScriptVersion | undefined = scripts.find((s) => s.id === viewId) ?? latest;
  const generating = project.jobs.some(
    (j) => j.type === 'generate_script' && (j.status === 'queued' || j.status === 'running'),
  );
  const isLatest = viewing?.id === latest?.id;
  const canApprove =
    !!viewing &&
    isLatest &&
    !generating &&
    !!viewing.script &&
    ['draft', 'awaiting_approval'].includes(viewing.status);

  const requestChanges = () =>
    regenerate.mutate(notes, {
      onSuccess: () => {
        setNotes('');
        setViewId(null);
      },
    });

  return (
    <section
      className="space-y-5 rounded-lg border border-line bg-surface p-6"
      aria-labelledby="script-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="script-heading" className="text-xl font-semibold">
          Script
        </h2>
        {scripts.length > 1 && (
          <div className="flex items-center gap-2">
            <Label htmlFor="script-version">Version</Label>
            <Select
              id="script-version"
              value={viewing?.id}
              onChange={(e) => setViewId(e.target.value)}
            >
              {scripts.map((s) => (
                <option key={s.id} value={s.id}>
                  v{s.version} · {versionStatus[s.status].label}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>

      {generating && (
        <p role="status" className="rounded-md bg-info-soft px-4 py-2 text-sm text-info">
          Writing a new version… about 1–2 minutes. This updates by itself, and the new file
          replaces the old one in Dropbox.
        </p>
      )}
      {!viewing && !generating && <p className="text-sm text-muted">No script yet.</p>}

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
              You’re looking at an older version. Only the newest one can be approved.
            </p>
          )}
          {viewing.status === 'approved' && (
            <p role="status" className="rounded-md bg-success-soft px-4 py-2 text-sm text-success">
              Approved. The final copy is saved as Script/script_APPROVED.docx in the topic’s
              Dropbox folder.
            </p>
          )}
          {viewing.dropbox_path ? (
            <p className="text-sm text-muted">
              In Dropbox:{' '}
              <span className="break-all font-mono text-xs">{viewing.dropbox_path}</span>
            </p>
          ) : viewing.last_error ? (
            <div
              role="alert"
              className="flex flex-wrap items-center gap-3 rounded-md bg-danger-soft px-4 py-2 text-sm text-danger"
            >
              {viewing.last_error}
              <Button
                size="sm"
                variant="outline"
                onClick={() => exportScript.mutate(viewing.id)}
                disabled={exportScript.isPending}
              >
                Retry upload
              </Button>
            </div>
          ) : isLatest ? (
            <p className="text-sm text-muted">Saving to Dropbox…</p>
          ) : (
            <p className="text-sm text-muted">
              Removed from Dropbox (replaced by a newer version).
            </p>
          )}
          {viewing.regen_notes && (
            <p className="text-sm text-muted">Written with these notes: “{viewing.regen_notes}”</p>
          )}

          <ScriptView version={viewing} />
        </>
      )}

      {latest && (
        <div className="space-y-3 border-t border-line pt-4">
          <h3 className="font-sans text-xs font-semibold uppercase tracking-wider text-muted">
            Review
          </h3>
          {canApprove && (
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => setConfirmApprove(true)} disabled={approve.isPending}>
                Approve script v{latest.version}
              </Button>
              <span className="text-sm text-muted">or request changes below.</span>
            </div>
          )}
          {approve.error && (
            <p role="alert" className="text-sm text-danger">
              {approve.error.message}
            </p>
          )}
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              requestChanges();
            }}
          >
            <Label htmlFor="regen-notes">
              {latest.status === 'approved'
                ? 'Write a new version anyway'
                : 'Not happy with it? Request changes'}
            </Label>
            <Textarea
              id="regen-notes"
              placeholder="What should change? e.g. a stronger opening, less about work, shorter scenes. Leave empty to simply regenerate."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <Button type="submit" variant="outline" disabled={regenerate.isPending || generating}>
              {generating
                ? 'Writing…'
                : notes.trim()
                  ? 'Regenerate with these changes'
                  : 'Regenerate script'}
            </Button>
            {latest.status === 'approved' && (
              <p className="text-xs text-muted">
                This replaces the approved script; the new version needs approving again.
              </p>
            )}
            {regenerate.error && (
              <p role="alert" className="text-sm text-danger">
                {regenerate.error.message}
              </p>
            )}
          </form>
        </div>
      )}

      {latest && (
        <ConfirmDialog
          open={confirmApprove}
          onOpenChange={setConfirmApprove}
          title={`Approve script v${latest.version}?`}
          description="It becomes the final script for this topic and is saved as script_APPROVED.docx in the Dropbox Script folder."
          confirmLabel="Approve"
          pending={approve.isPending}
          onConfirm={() => approve.mutate(latest.id, { onSettled: () => setConfirmApprove(false) })}
        />
      )}
    </section>
  );
}
