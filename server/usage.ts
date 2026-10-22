// Usage Log → the numbers on Admin → Usage. Pure; tested in server/tests/admin.test.ts.
import type { UsageSummary, UsageTotals } from '../src/types/api.js';

export interface UsageRow {
  at: string;
  provider: string;
  key: string;
  model: string;
  project: string;
  input: number;
  output: number;
  cost: number;
  ms: number;
}

const zero = (): UsageTotals => ({ calls: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0 });
const round = (t: UsageTotals): UsageTotals => ({
  ...t,
  cost_usd: Math.round(t.cost_usd * 10_000) / 10_000,
});

function add(t: UsageTotals, r: UsageRow): void {
  t.calls++;
  t.input_tokens += r.input;
  t.output_tokens += r.output;
  t.cost_usd += r.cost;
}

/** Totals per group key, plus the average call time. */
function group(
  rows: UsageRow[],
  keyOf: (r: UsageRow) => string,
): Array<[string, UsageTotals, number]> {
  const map = new Map<string, { t: UsageTotals; ms: number }>();
  for (const r of rows) {
    const g = map.get(keyOf(r)) ?? { t: zero(), ms: 0 };
    add(g.t, r);
    g.ms += r.ms;
    map.set(keyOf(r), g);
  }
  return [...map].map(([k, g]) => [k, round(g.t), Math.round(g.ms / g.t.calls)]);
}

const dearest = (a: [string, UsageTotals, number], b: [string, UsageTotals, number]) =>
  b[1].cost_usd - a[1].cost_usd || b[1].calls - a[1].calls;

export function summarizeUsage(rows: UsageRow[], since: string): UsageSummary {
  const total = zero();
  for (const r of rows) add(total, r);
  return {
    since,
    total: round(total),
    by_month: group(rows, (r) => r.at.slice(0, 7))
      .map(([month, t]) => ({ month, ...t }))
      .sort((a, b) => b.month.localeCompare(a.month)),
    by_prompt: group(rows, (r) => r.key || r.provider)
      .sort(dearest)
      .map(([key, t, avg_ms]) => ({ key, ...t, avg_ms })),
    by_project: group(rows, (r) => r.project || '(no project)')
      .sort(dearest)
      .slice(0, 10)
      .map(([project, t]) => ({ project, ...t })),
    by_provider: group(rows, (r) => r.provider)
      .sort(dearest)
      .map(([provider, t]) => ({ provider, ...t })),
    recent: [...rows]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 20)
      .map((r) => ({
        at: r.at,
        provider: r.provider,
        key: r.key,
        model: r.model,
        input_tokens: r.input,
        output_tokens: r.output,
        cost_usd: r.cost,
        ms: r.ms,
      })),
  };
}
