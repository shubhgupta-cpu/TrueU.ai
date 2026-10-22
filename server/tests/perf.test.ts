// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { memo, dropMemo } from '../cache.js';
import { cacheableBlocks, costUsd } from '../claude.js';
import { renderPrompt } from '../render.js';

describe('prompt caching', () => {
  const body = `${'Static instructions. '.repeat(120)}\n\nInputs: {{topic}} / {{notes}}`;
  it('marks the text before the first variable as cacheable and keeps the whole text', () => {
    const content =
      renderPrompt(body, { topic: 'AI agents', notes: 'be brief' }) + '\n\nOUTPUT CONTRACT';
    const blocks = cacheableBlocks(body, content, undefined) as Array<{
      text: string;
      cache_control?: unknown;
    }>;
    expect(blocks).toHaveLength(2);
    expect(blocks[0]!.cache_control).toEqual({ type: 'ephemeral' });
    expect(blocks[0]!.text.endsWith('Inputs: ')).toBe(true);
    expect(blocks.map((b) => b.text).join('')).toBe(content);
  });

  it('does not split a short prompt', () => {
    const content = renderPrompt('Hi {{x}}', { x: '1' });
    expect(cacheableBlocks('Hi {{x}}', content, undefined)).toEqual([
      { type: 'text', text: content },
    ]);
  });

  it('prices cache reads at a tenth and writes at 1.25×', () => {
    const base = costUsd('claude-haiku-5-5', 1_000_000, 0);
    if (base === undefined) return;
    expect(costUsd('claude-haiku-5-5', 0, 0, 0, 1_000_000)).toBeCloseTo(base * 0.1);
    expect(costUsd('claude-haiku-5-5', 0, 0, 1_000_000, 0)).toBeCloseTo(base * 1.25);
  });
});

describe('memo', () => {
  it('shares one load, honours the TTL and can be dropped', async () => {
    let loads = 0;
    const load = async () => ++loads;
    const [a, b] = await Promise.all([memo('t:k', 1000, load), memo('t:k', 1000, load)]);
    expect([a, b, loads]).toEqual([1, 1, 1]);
    dropMemo('t:');
    expect(await memo('t:k', 1000, load)).toBe(2);
  });

  it('does not keep a failed load', async () => {
    let n = 0;
    const flaky = async () => {
      if (++n === 1) throw new Error('boom');
      return 'ok';
    };
    await expect(memo('t:f', 1000, flaky)).rejects.toThrow('boom');
    expect(await memo('t:f', 1000, flaky)).toBe('ok');
    dropMemo('t:');
  });
});

import { afterFailure, loginAttempt } from '../auth.js';

describe('login lockout', () => {
  const now = Date.parse('2026-10-22T12:00:00Z');
  it('locks for 15 minutes after the fifth wrong password', () => {
    expect(afterFailure(3, now)).toEqual({ 'Failed Logins': 4 });
    const locked = afterFailure(4, now);
    expect(locked['Failed Logins']).toBe(0);
    expect(locked['Locked Until']).toBe('2026-10-22T12:15:00.000Z');
  });
  it('refuses while locked and allows after', () => {
    expect(loginAttempt({ failed: 0, lockedUntil: '2026-10-22T12:15:00.000Z' }, now)).toEqual({
      locked: true,
      minutes: 15,
    });
    expect(loginAttempt({ failed: 0, lockedUntil: '2026-10-22T11:59:00.000Z' }, now)).toEqual({
      locked: false,
    });
    expect(loginAttempt({ failed: 2, lockedUntil: null }, now)).toEqual({ locked: false });
  });
});
