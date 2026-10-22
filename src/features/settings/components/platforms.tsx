import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api';
import type { PlatformRule } from '@/types/api';

/** What the app really uses for each platform. Read-only: the limits come from the client's caption prompt. */
export function Platforms() {
  const q = useQuery({
    queryKey: ['platform-rules'],
    queryFn: () => api<PlatformRule[]>('/admin/platforms'),
    staleTime: 300_000,
  });
  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm text-muted">
        The caption length the prompt aims for, where each platform folds the text behind “more”
        (used in the previews), and exactly which fields the Make.com webhook receives. These come
        from the client’s prompts and the webhook list, so they are shown here for reference, not
        edited.
      </p>
      {q.isError && (
        <p role="alert" className="text-sm text-danger">
          {q.error.message}
        </p>
      )}
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="p-3">Platform</th>
              <th className="p-3">Caption length</th>
              <th className="p-3">Visible before “more”</th>
              <th className="p-3">Webhook receives</th>
              <th className="p-3">Server setting</th>
            </tr>
          </thead>
          <tbody>
            {(q.data ?? []).map((r) => (
              <tr key={r.platform} className="border-t border-line align-top">
                <td className="p-3 font-medium">{r.label}</td>
                <td className="p-3 font-mono text-xs">
                  {r.caption_min !== null
                    ? `${r.caption_min}–${r.caption_max} characters`
                    : 'Set by the YouTube prompt'}
                </td>
                <td className="p-3 font-mono text-xs">
                  {r.visible_chars ? `${r.visible_chars} characters` : '—'}
                </td>
                <td className="p-3 font-mono text-xs">{r.webhook_fields.join(', ')}</td>
                <td className="p-3 font-mono text-xs">{r.webhook_env ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
