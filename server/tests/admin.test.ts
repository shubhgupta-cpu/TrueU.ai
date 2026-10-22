// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { summarizeUsage, type UsageRow } from '../usage.js';

const row = (over: Partial<UsageRow>): UsageRow => ({
  at: '2026-10-20T10:00:00Z',
  provider: 'anthropic',
  key: 'script_generate',
  model: 'claude-haiku-5-5',
  project: 'Topic A',
  input: 1000,
  output: 500,
  cost: 0.01,
  ms: 2000,
  ...over,
});

describe('usage summary', () => {
  const rows = [
    row({}),
    row({ key: 'blog_generate', cost: 0.05, input: 3000, output: 2000, ms: 4000 }),
    row({ at: '2026-09-02T10:00:00Z', project: 'Topic B', cost: 0.02 }),
    row({ provider: 'serpapi', key: '', model: '', cost: 0, input: 0, output: 0, ms: 600 }),
  ];
  const s = summarizeUsage(rows, '2026-07-24');
  it('adds up the totals', () => {
    expect(s.total).toEqual({ calls: 4, input_tokens: 5000, output_tokens: 3000, cost_usd: 0.08 });
  });
  it('groups by month (newest first), prompt (dearest first) and project', () => {
    expect(s.by_month.map((m) => [m.month, m.calls])).toEqual([
      ['2026-10', 3],
      ['2026-09', 1],
    ]);
    expect(s.by_prompt[0]!.key).toBe('blog_generate');
    expect(s.by_prompt.find((p) => p.key === 'script_generate')!.calls).toBe(2);
    expect(s.by_project.map((p) => p.project)).toEqual(['Topic A', 'Topic B']);
  });
  it('lists the newest calls first', () => {
    expect(s.recent[0]!.at).toBe('2026-10-20T10:00:00Z');
    expect(s.recent).toHaveLength(4);
  });
});

import { accessChangeError } from '../repo/admin.js';

describe('access changes', () => {
  const users = [
    { id: 'a', role: 'admin' as const, active: true },
    { id: 'b', role: 'admin' as const, active: true },
    { id: 'c', role: 'owner' as const, active: true },
  ];
  it('blocks removing or demoting yourself', () => {
    expect(accessChangeError(users, 'a', 'a', 'remove')).toMatch(/own access/);
    expect(accessChangeError(users, 'a', 'a', { role: 'editor' })).toMatch(/own role/);
  });
  it('keeps at least one active admin', () => {
    expect(accessChangeError(users, 'b', 'a', 'remove')).toBeNull();
    const oneLeft = [users[0]!, { ...users[1]!, active: false }, users[2]!];
    expect(accessChangeError(oneLeft, 'a', 'c', 'remove')).toMatch(/at least one admin/);
  });
  it('lets an admin change someone else', () => {
    expect(accessChangeError(users, 'c', 'a', { role: 'editor' })).toBeNull();
    expect(accessChangeError(users, 'c', 'a', 'remove')).toBeNull();
  });
});
