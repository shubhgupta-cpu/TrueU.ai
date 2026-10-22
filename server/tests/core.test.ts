// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createSessionToken, hashPassword, verifyPassword, verifySessionToken } from '../auth.js';
import { apiArg } from '../dropbox.js';
import { monthlyTopicsRunKey, weeklyTrendsRunKey } from '../cron.js';
import { backoffUntil, failureOutcome } from '../jobs/rules.js';
import {
  DEFAULT_LAYOUT,
  layoutFrom,
  projectFolder,
  scriptFileName,
  titleSlug,
  topicFolderName,
} from '../paths.js';
import { extractJson, promptVariables, PromptRenderError, renderPrompt } from '../render.js';

const now = new Date('2026-10-13T09:00:00Z');

describe('job rules', () => {
  it('doubles the backoff per attempt', () => {
    expect(backoffUntil(1, now).toISOString()).toBe('2026-10-13T09:02:00.000Z');
    expect(backoffUntil(3, now).toISOString()).toBe('2026-10-13T09:08:00.000Z');
  });

  it('requeues below max attempts, fails at the last one or on permanent errors', () => {
    expect(failureOutcome({ attempts: 1, max_attempts: 3 }, 'boom', now)).toEqual({
      status: 'queued',
      run_after: '2026-10-13T09:02:00.000Z',
      last_error: 'boom',
    });
    expect(failureOutcome({ attempts: 3, max_attempts: 3 }, 'boom', now)).toEqual({
      status: 'failed',
      last_error: 'boom',
    });
    expect(failureOutcome({ attempts: 1, max_attempts: 3 }, 'bad', now, true)).toEqual({
      status: 'failed',
      last_error: 'bad',
    });
  });
});

describe('prompt rendering', () => {
  it('renders strings as-is and objects as pretty JSON', () => {
    expect(
      renderPrompt('T: {{topic}}\nB: {{ brand_context }}', {
        topic: 'Quit?',
        brand_context: { voice: 'calm' },
      }),
    ).toBe('T: Quit?\nB: {\n  "voice": "calm"\n}');
    expect(promptVariables('{{a}} {{ b }} {{a}}')).toEqual(['a', 'b']);
  });

  it('errors on missing variables and leftover n8n placeholders', () => {
    expect(() => renderPrompt('{{topic}} {{prior_improvements}}', { topic: 'x' })).toThrow(
      PromptRenderError,
    );
    expect(() => renderPrompt("<t>{{ $json['All Topics'] }}</t>", {})).toThrow(
      "{{ $json['All Topics'] }}",
    );
  });

  it('extracts JSON from fences and prose', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Here you go:\n{"a":[1,2]}\nThanks')).toEqual({ a: [1, 2] });
    expect(() => extractJson('no json here')).toThrow(SyntaxError);
  });

  it('ignores a stray closing brace or trailing text after complete JSON', () => {
    expect(extractJson('{"evaluation":{"summary":"ok }"}}}')).toEqual({
      evaluation: { summary: 'ok }' },
    });
    expect(extractJson('{"a":"x \\" {"} trailing } text')).toEqual({ a: 'x " {' });
    expect(() => extractJson('{"a": 1')).toThrow();
  });
});

describe('daily cron keys (local date)', () => {
  it('runs monthly topics on the first Monday only', () => {
    expect(monthlyTopicsRunKey(new Date('2026-10-05T12:00:00Z'), 'UTC')).toBe(
      'generate_topics:2026-10',
    );
    expect(monthlyTopicsRunKey(new Date('2026-10-12T12:00:00Z'), 'UTC')).toBeNull(); // 2nd Monday
    expect(monthlyTopicsRunKey(new Date('2026-10-06T12:00:00Z'), 'UTC')).toBeNull(); // Tuesday
    // Sydney is already Monday 5 Oct when it's Sunday 4 Oct 22:00 UTC.
    expect(monthlyTopicsRunKey(new Date('2026-10-04T22:00:00Z'), 'Australia/Sydney')).toBe(
      'generate_topics:2026-10',
    );
  });

  it('runs weekly trends every Monday', () => {
    expect(weeklyTrendsRunKey(new Date('2026-10-12T12:00:00Z'), 'UTC')).toBe(
      'pull_trends:2026-10-12',
    );
    expect(weeklyTrendsRunKey(new Date('2026-10-13T12:00:00Z'), 'UTC')).toBeNull();
  });
});

describe('Dropbox paths', () => {
  it('slugs titles safely', () => {
    expect(titleSlug('Why entrepreneurs struggle?')).toBe('Why-Entrepreneurs-Struggle');
    expect(titleSlug("Café owners' hardest decision — now")).toBe(
      'Cafe-Owners-Hardest-Decision-Now',
    );
    expect(titleSlug('???')).toBe('Untitled');
    expect(titleSlug('word '.repeat(40)).length).toBeLessThanOrEqual(60);
  });

  it('builds Year - YYYY / Month YYYY / Topic name, rolling over with the year', () => {
    expect(projectFolder(DEFAULT_LAYOUT, '2026-10-01', 'AI Surveillance')).toBe(
      '/Year - 2026/October 2026/AI Surveillance',
    );
    expect(projectFolder(DEFAULT_LAYOUT, '2027-01-01', 'Gun Control')).toBe(
      '/Year - 2027/January 2027/Gun Control',
    );
    const custom = layoutFrom({ root: '/Shared/', month_folder: '{MM} {Mon}' });
    expect(projectFolder(custom, '2026-03-01', 'X')).toBe('/Shared/Year - 2026/03 Mar/X');
    expect(scriptFileName(2, 'docx')).toBe('script_v2.docx');
  });

  it('keeps topic folder names readable and valid', () => {
    expect(topicFolderName('Should I quit: yes/no?')).toBe('Should I quit yes no');
    expect(topicFolderName('  Ends with dots... ')).toBe('Ends with dots');
    const long = topicFolderName('word '.repeat(40));
    expect(long.length).toBeLessThanOrEqual(80);
    expect(long.endsWith(' ')).toBe(false);
  });

  it('fills an old or partial dropbox setting with the defaults', () => {
    expect(layoutFrom({ root: '/TrueU' } as never).subfolders).toContain('Script');
    expect(layoutFrom(null)).toEqual(DEFAULT_LAYOUT);
  });

  it('escapes non-ASCII in the Dropbox-API-Arg header', () => {
    expect(apiArg({ path: '/TrueU/Café — 1' })).toBe('{"path":"/TrueU/Caf\\u00e9 \\u2014 1"}');
  });
});

describe('login', () => {
  it('hashes and verifies passwords', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(hash).toMatch(/^scrypt\$/);
    expect(await verifyPassword('correct horse battery', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
    expect(await verifyPassword('x', 'garbage')).toBe(false);
  });

  it('signs session tokens that expire and resist tampering', () => {
    const secret = 'test-secret';
    const t0 = Date.parse('2026-10-13T00:00:00Z');
    const token = createSessionToken('recAAAAAAAAAAAAAA', t0, secret);
    expect(verifySessionToken(token, t0, secret)).toBe('recAAAAAAAAAAAAAA');
    expect(verifySessionToken(token, t0 + 15 * 86_400_000, secret)).toBeNull(); // > 14 days
    expect(verifySessionToken(token, t0, 'other-secret')).toBeNull();
    expect(verifySessionToken(token.replace('recA', 'recB'), t0, secret)).toBeNull();
  });
});
