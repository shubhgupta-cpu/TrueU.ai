import { useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useDeleteTopic, type Topic } from '../api';

/** Deletes one or several topics, one request each so a failure never loses the rest. */
export function DeleteTopicsDialog({
  topics,
  onClose,
  onDeleted,
}: {
  topics: Topic[] | null;
  onClose: () => void;
  /** Called with the ids that were deleted. */
  onDeleted: (ids: string[]) => void;
}) {
  const remove = useDeleteTopic();
  const [done, setDone] = useState(0);
  const [running, setRunning] = useState(false);
  const [failed, setFailed] = useState<string[]>([]);
  const list = topics ?? [];
  const withWork = list.filter((t) => t.status === 'selected').length;

  const run = async () => {
    setRunning(true);
    setFailed([]);
    setDone(0);
    const ok: string[] = [];
    const bad: string[] = [];
    for (const t of list) {
      try {
        await remove.mutateAsync(t.id);
        ok.push(t.id);
      } catch (err) {
        bad.push(`#${t.topic_number}: ${err instanceof Error ? err.message : 'failed'}`);
      }
      setDone((n) => n + 1);
    }
    setRunning(false);
    if (ok.length) onDeleted(ok);
    if (bad.length) setFailed(bad);
    else onClose();
  };

  return (
    <ConfirmDialog
      open={topics !== null}
      onOpenChange={(open) => !open && !running && onClose()}
      title={list.length === 1 ? 'Delete this topic?' : `Delete ${list.length} topics?`}
      description={
        <div className="space-y-2 text-sm">
          {list.length <= 5 ? (
            <ul className="list-disc space-y-1 pl-5">
              {list.map((t) => (
                <li key={t.id}>
                  <span className="font-mono text-xs">#{t.topic_number}</span> {t.title}
                </li>
              ))}
            </ul>
          ) : (
            <p>
              <span className="font-mono">#{list[0]?.topic_number}</span> {list[0]?.title}, and{' '}
              {list.length - 1} more.
            </p>
          )}
          <p>
            Their scores and anything generated in the app (scripts, blogs, captions, schedules) are
            deleted.
            {withWork > 0 &&
              ` ${withWork} ${withWork === 1 ? 'is' : 'are'} already selected topics with content.`}{' '}
            Dropbox files are kept. This can’t be undone.
          </p>
          {failed.length > 0 && (
            <div role="alert" className="text-danger">
              <p>Couldn’t delete:</p>
              <ul className="list-disc pl-5">
                {failed.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      }
      confirmLabel={
        running ? `Deleting ${done} of ${list.length}…` : failed.length ? 'Try again' : 'Delete'
      }
      pending={running}
      onConfirm={run}
    />
  );
}
