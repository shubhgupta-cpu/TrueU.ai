import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { PostPreviewCard } from '@/components/previews/post-preview';
import { Card } from '@/components/ui/card';
import { api, POLL_IDLE_MS } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { PostPreview } from '@/types/api';

const TABS: Array<[string, string]> = [
  ['short_1', 'Short 1'],
  ['short_2', 'Short 2'],
  ['short_3', 'Short 3'],
  ['long_video', 'Long video'],
];

/** How each video's post will look on every platform it goes to. */
export function PreviewsPanel({ projectId }: { projectId: string }) {
  const { data = [] } = useQuery({
    queryKey: ['previews', projectId],
    queryFn: () => api<PostPreview[]>(`/projects/${projectId}/previews`),
    refetchInterval: POLL_IDLE_MS,
  });
  const [role, setRole] = useState('short_1');
  const shown = data.filter((p) => p.asset_role === role);
  return (
    <Card className="space-y-4 p-6">
      <h2 className="text-xl font-semibold">Previews</h2>
      <p className="text-sm text-muted">
        How each post will look on its platform, with the editor's video from Dropbox and the
        caption below it. An approximation: each platform adds its own buttons and layout.
      </p>
      <div role="tablist" aria-label="Video" className="flex flex-wrap gap-2">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={role === key}
            onClick={() => setRole(key)}
            className={cn(
              'min-h-touch rounded-md border px-4 text-sm',
              role === key
                ? 'border-accent bg-accent-soft font-medium text-accent'
                : 'border-line bg-surface hover:bg-ground',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="text-sm text-muted">No captions generated for this video yet.</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] items-stretch gap-4">
          {shown.map((p) => (
            <PostPreviewCard key={p.key} post={p} />
          ))}
        </div>
      )}
    </Card>
  );
}
