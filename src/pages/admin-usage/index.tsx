import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { useUsage } from '@/features/admin/api';
import { formatDateTime, formatMonth } from '@/lib/time';
import type { UsageTotals } from '@/types/api';

const n = (v: number) => v.toLocaleString('en-US');
const usd = (v: number) => `$${v.toFixed(v < 1 ? 4 : 2)}`;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </Card>
  );
}

function Table({
  title,
  rows,
  first,
}: {
  title: string;
  rows: Array<UsageTotals & { name: string }>;
  first: string;
}) {
  return (
    <Card className="overflow-x-auto p-0">
      <h2 className="p-4 text-lg font-semibold">{title}</h2>
      <table className="w-full min-w-[520px] text-sm">
        <thead className="border-y border-line text-left text-xs uppercase tracking-wider text-muted">
          <tr>
            <th className="p-3">{first}</th>
            <th className="p-3 text-right">Calls</th>
            <th className="p-3 text-right">Input</th>
            <th className="p-3 text-right">Output</th>
            <th className="p-3 text-right">Cost</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td className="p-3 text-muted" colSpan={5}>
                Nothing yet.
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={r.name} className="border-t border-line">
              <td className="p-3 font-mono text-xs">{r.name}</td>
              <td className="p-3 text-right font-mono">{n(r.calls)}</td>
              <td className="p-3 text-right font-mono">{n(r.input_tokens)}</td>
              <td className="p-3 text-right font-mono">{n(r.output_tokens)}</td>
              <td className="p-3 text-right font-mono">{usd(r.cost_usd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export default function UsagePage() {
  const { data, isLoading, error } = useUsage();
  return (
    <>
      <PageHeader
        title="Usage and costs"
        description="Claude, SerpAPI and Bannerbear calls over the last 90 days. Cost is an estimate from token counts."
      />
      <div className="mt-6 space-y-6">
        {isLoading && <p className="text-sm text-muted">Loading…</p>}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error.message}
          </p>
        )}
        {data && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="Estimated cost" value={usd(data.total.cost_usd)} />
              <Stat label="Calls" value={n(data.total.calls)} />
              <Stat label="Input tokens" value={n(data.total.input_tokens)} />
              <Stat label="Output tokens" value={n(data.total.output_tokens)} />
            </div>
            <Table
              title="By month"
              first="Month"
              rows={data.by_month.map((m) => ({ ...m, name: formatMonth(m.month) }))}
            />
            <Table
              title="By prompt"
              first="Prompt"
              rows={data.by_prompt.map((p) => ({ ...p, name: p.key }))}
            />
            <Table
              title="By topic"
              first="Topic"
              rows={data.by_project.map((p) => ({ ...p, name: p.project }))}
            />
            <Table
              title="By service"
              first="Service"
              rows={data.by_provider.map((p) => ({ ...p, name: p.provider }))}
            />
            <Card className="overflow-x-auto p-0">
              <h2 className="p-4 text-lg font-semibold">Latest calls</h2>
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-y border-line text-left text-xs uppercase tracking-wider text-muted">
                  <tr>
                    <th className="p-3">When</th>
                    <th className="p-3">Prompt</th>
                    <th className="p-3 text-right">Tokens in / out</th>
                    <th className="p-3 text-right">Time</th>
                    <th className="p-3 text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent.map((r, i) => (
                    <tr key={`${r.at}-${i}`} className="border-t border-line">
                      <td className="p-3 font-mono text-xs">
                        {formatDateTime(r.at, 'America/New_York')}
                      </td>
                      <td className="p-3 font-mono text-xs">{r.key || r.provider}</td>
                      <td className="p-3 text-right font-mono">
                        {n(r.input_tokens)} / {n(r.output_tokens)}
                      </td>
                      <td className="p-3 text-right font-mono">{(r.ms / 1000).toFixed(1)} s</td>
                      <td className="p-3 text-right font-mono">{usd(r.cost_usd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </>
        )}
      </div>
    </>
  );
}
