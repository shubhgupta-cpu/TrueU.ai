// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { claudeFixtures } from '../fixtures/index.js';
import { episodeInput } from '../jobs/projects.js';
import { Script, scriptWarnings } from '../schemas/script.js';
import { scenes, scriptDocx, scriptMarkdown } from '../script-doc.js';

const fixture = claudeFixtures.script_generate![0];
const script = Script.parse(fixture);
const meta = { projectTitle: 'AI course', version: 2, score: '51/60', generatedAt: '2026-10-13' };
const clone = () => Script.parse(structuredClone(fixture));

describe('script output (Storyboard Creation Prompt v2.0)', () => {
  it('requires every section: 6 short clips, 3 clip timestamps, all scenes', () => {
    const raw = structuredClone(fixture) as Record<string, unknown> & {
      short_form_clips: unknown[];
      clip_timestamps: unknown[];
      long_form_storyboard: Record<string, unknown>;
    };
    expect(
      Script.safeParse({ ...raw, short_form_clips: raw.short_form_clips.slice(0, 5) }).success,
    ).toBe(false);
    expect(
      Script.safeParse({ ...raw, clip_timestamps: raw.clip_timestamps.slice(0, 2) }).success,
    ).toBe(false);
    expect(
      Script.safeParse({
        ...raw,
        long_form_storyboard: { ...raw.long_form_storyboard, scene_4: undefined },
      }).success,
    ).toBe(false);
    expect(Script.safeParse({ ...raw, youtube_optimization: undefined }).success).toBe(false);
  });

  it('passes the brand self-check when the rules are followed', () => {
    expect(scriptWarnings(script)).toEqual([]);
  });

  it('flags brand rule breaks as warnings', () => {
    const s = clone();
    s.long_form_storyboard.scene_2.narration += ' It is simple — really.';
    s.long_form_storyboard.scene_7_cta.narration = 'TrueU is a thinking partner. Try it.';
    s.short_form_clips[3]!.platform_tease = 'Try TrueU.ai, your AI journal.';
    s.youtube_optimization.description = 'End-to-end encrypted and guaranteed to help. TrueU.ai';
    s.youtube_optimization.title = 'x'.repeat(61);
    s.long_form_storyboard.scene_1.narration = 'Too short.';
    const w = scriptWarnings(s).join('\n');
    expect(w).toContain('Em/en dashes in 1 field(s): long_form_storyboard.scene_2.narration');
    expect(w).toContain('Brand name not written as "TrueU.ai"');
    expect(w).toContain('Scene 7 CTA doesn\'t name "Private Intelligence"');
    expect(w).toContain('Clip 4 platform tease doesn\'t name "Private Intelligence"');
    expect(w).toContain('YouTube description doesn\'t name "Private Intelligence"');
    expect(w).toContain('claims end-to-end encryption');
    expect(w).toContain('guarantee');
    expect(w).toContain('forbidden term');
    expect(w).toContain('YouTube title is 61 characters');
    expect(w).toContain('Scene 1 narration is 2 words');
  });

  it('feeds episode_title and shared_value from the topic score storyboard', () => {
    expect(
      episodeInput('Title', 'Title\n\nDesc', { episode_title: 'Ep', shared_value: 'Trust' }),
    ).toEqual({
      topic: 'Title\n\nDesc',
      episode_title: 'Ep',
      shared_value: 'Trust',
    });
    const fallback = episodeInput('Title', 'Title', { episode_title: '', shared_value: ' ' });
    expect(fallback.episode_title).toBe('Title');
    expect(fallback.shared_value).toMatch(/^Not set/);
  });

  it('renders Markdown with all sections in order', () => {
    const md = scriptMarkdown(script, meta);
    expect(md).toContain('# The Course Question');
    expect(md).toContain('Version 2 · Topic score 51/60');
    expect(md.match(/^### Scene \d\./gm)).toHaveLength(8);
    expect(md).toContain('- **Short 2** 5:45-6:30 (Scene 4)');
    expect(md.match(/^### Clip \d\./gm)).toHaveLength(6);
    const order = [
      '## Opening examples',
      '## Long-form storyboard',
      '## Clip timestamps',
      '## Short-form clips',
      '## YouTube',
      '## Closing reflection',
    ];
    expect(order.map((h) => md.indexOf(h))).toEqual(
      [...order.map((h) => md.indexOf(h))].sort((a, b) => a - b),
    );
    expect(scenes(script)).toHaveLength(7);
  });

  it('builds a .docx (a zip file)', async () => {
    const bytes = await scriptDocx(script, meta);
    expect(bytes.byteLength).toBeGreaterThan(5_000);
    expect(String.fromCharCode(bytes[0]!, bytes[1]!)).toBe('PK');
  });
});
