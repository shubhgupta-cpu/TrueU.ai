import { useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import { useSeedKeywordMutations, useSeedKeywords } from '../api';

/** F2.5: the weekly SerpAPI pull searches every active keyword. */
export function SeedKeywords() {
  const keywords = useSeedKeywords();
  const { add, toggle, remove } = useSeedKeywordMutations();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; keyword: string } | null>(null);

  const onAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (draft.trim().length < 2) {
      setError('Enter a keyword.');
      return;
    }
    try {
      await add.mutateAsync(draft);
      setDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t add the keyword.');
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <form onSubmit={onAdd} className="flex items-end gap-2" noValidate>
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="new-keyword">New keyword</Label>
          <Input
            id="new-keyword"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-invalid={!!error}
          />
        </div>
        <Button type="submit" disabled={add.isPending}>
          Add
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {keywords.isLoading && <p className="text-sm text-muted">Loading…</p>}
      {keywords.data?.length === 0 && (
        <p className="text-sm text-muted">No keywords yet. Trend pulls need at least one.</p>
      )}
      <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
        {keywords.data?.map((k) => (
          <li key={k.id} className="flex flex-wrap items-center gap-3 px-4 py-2">
            <span className="flex-1 font-mono text-sm">{k.keyword}</span>
            <StatusBadge
              meta={
                k.is_active
                  ? { label: 'Active', tone: 'success' }
                  : { label: 'Disabled', tone: 'neutral' }
              }
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => toggle.mutate({ id: k.id, is_active: !k.is_active })}
            >
              {k.is_active ? 'Disable' : 'Enable'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDeleting({ id: k.id, keyword: k.keyword })}
            >
              Delete
            </Button>
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete keyword?"
        description={`“${deleting?.keyword}” won’t be searched any more. Topics it already produced stay.`}
        confirmLabel="Delete"
        pending={remove.isPending}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id);
          setDeleting(null);
        }}
      />
    </div>
  );
}
