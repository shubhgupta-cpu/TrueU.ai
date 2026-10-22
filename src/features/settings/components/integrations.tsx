import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, CircleAlert, CircleDashed } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/time';
import type { IntegrationCheck } from '@/types/api';

const META = {
  ok: { label: 'Connected', cls: 'text-success', Icon: CheckCircle2 },
  missing: { label: 'Not set up', cls: 'text-warning', Icon: CircleDashed },
  error: { label: 'Problem', cls: 'text-danger', Icon: CircleAlert },
} as const;

/** Is every outside service connected? Shows set / missing / error: never a key or URL. */
export function Integrations() {
  const q = useQuery({
    queryKey: ['integrations'],
    queryFn: () => api<IntegrationCheck[]>('/admin/integrations'),
    staleTime: 0,
  });
  const groups = [...new Set((q.data ?? []).map((c) => c.group))];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted">
          Whether each outside service is connected. Keys and webhook addresses are never shown
          here; they live on the server only.
        </p>
        <Button variant="outline" onClick={() => q.refetch()} disabled={q.isFetching}>
          {q.isFetching ? 'Checking…' : 'Check again'}
        </Button>
      </div>
      {q.isError && (
        <p role="alert" className="text-sm text-danger">
          {q.error.message}
        </p>
      )}
      {groups.map((g) => (
        <Card key={g} className="overflow-hidden p-0">
          <h2 className="p-4 text-lg font-semibold">{g}</h2>
          <ul>
            {q
              .data!.filter((c) => c.group === g)
              .map((c) => {
                const m = META[c.status];
                return (
                  <li
                    key={c.name}
                    className="flex flex-wrap items-start gap-x-4 gap-y-1 border-t border-line p-4"
                  >
                    <span
                      className={`flex w-32 shrink-0 items-center gap-2 text-sm font-medium ${m.cls}`}
                    >
                      <m.Icon aria-hidden className="h-4 w-4" />
                      {m.label}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{c.name}</p>
                      <p className="text-sm text-muted">{c.detail}</p>
                    </div>
                    {c.at && (
                      <span className="font-mono text-xs text-muted">
                        {formatDateTime(c.at, 'America/New_York')}
                      </span>
                    )}
                  </li>
                );
              })}
          </ul>
        </Card>
      ))}
    </div>
  );
}
