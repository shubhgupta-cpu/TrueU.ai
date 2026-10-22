// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { claudeFixtures } from '../fixtures/index.js';
import { Blog } from '../schemas/blog.js';
import { Ctas, ctaWarnings, extrasInput, Polls, pollWarnings } from '../schemas/extras.js';
import { Script } from '../schemas/script.js';

const ctas = Ctas.parse(claudeFixtures.cta_generate![0]);
const polls = Polls.parse(claudeFixtures.poll_generate![0]);

describe('CTAs & hooks (v3.7)', () => {
  it('passes when the rules are followed', () => {
    for (const [group, fields] of Object.entries(ctas.ctas)) {
      expect(
        ctaWarnings(group as keyof typeof ctas.ctas, fields as Record<string, string>),
      ).toEqual([]);
    }
  });

  it('allows finishing a word up to 2 characters over, not more', () => {
    expect(
      ctaWarnings('twitter', { quote_text: 'x'.repeat(102), handle: 'Think it through' }),
    ).toEqual([]);
    expect(
      ctaWarnings('twitter', { quote_text: 'x'.repeat(103), handle: 'Think it through' }),
    ).toEqual(['Quote text is 103 characters (target 100, at most 2 over)']);
  });

  it('checks the Instagram label, reel overlay and the X handle', () => {
    const w = ctaWarnings('instagram', {
      label: 'Mixed Case',
      title: 't',
      reel_overlay_cta: 'Read the full article',
      bio_link_cta: 'b',
      caption_cta: 'c',
    });
    expect(w).toEqual(
      expect.arrayContaining([
        'Label must be ALL CAPS',
        'Reel overlay CTA must end with an arrow',
        'Reel overlay CTA has 4 words before the arrow (exactly 3)',
      ]),
    );
    expect(
      ctaWarnings('instagram', {
        label: 'OK',
        title: 't',
        reel_overlay_cta: 'Read it now →',
        bio_link_cta: 'b',
        caption_cta: 'c',
      }),
    ).toEqual([]);
    expect(ctaWarnings('twitter', { quote_text: 'q', handle: '@think_it' })).toContain(
      'Handle must be plain words (no @ # _ numbers hyphens or symbols)',
    );
    expect(
      ctaWarnings('facebook', { quote_text: 'A — B', caption_cta: 'c', comment_cta: 'd' }),
    ).toContain('Quote text contains an em dash');
  });

  it('requires all seven platform groups', () => {
    const raw = structuredClone(claudeFixtures.cta_generate![0]) as {
      ctas: Record<string, unknown>;
    };
    expect(Ctas.safeParse({ ...raw, ctas: { ...raw.ctas, pinterest: undefined } }).success).toBe(
      false,
    );
  });
});

describe('Polls (v1.0)', () => {
  it('requires exactly 5 polls', () => {
    expect(Polls.safeParse({ polls: polls.polls.slice(0, 4) }).success).toBe(false);
  });

  it('flags length, missing question mark and repeated categories', () => {
    expect(polls.polls.map((p) => pollWarnings(p, polls.polls))).toEqual([[], [], [], [], []]);
    const bad = { ...polls.polls[0]!, question: `${'x'.repeat(121)}`, category: 'Values Check' };
    const w = pollWarnings(bad, [bad, polls.polls[1]!]);
    expect(w).toEqual(
      expect.arrayContaining([
        'Question is 121 characters (under 120)',
        'Not phrased as a question',
        'Category "Values Check" is used by another poll (variety expected)',
      ]),
    );
  });
});

describe('inputs', () => {
  it('builds both prompts’ inputs from the script, blog and settings', () => {
    const input = extrasInput({
      topicTitle: 'Learn or leave?',
      category: null,
      script: Script.parse(claudeFixtures.script_generate![0]),
      blog: Blog.parse(claudeFixtures.blog_generate![0]),
      videoId: 'vid202610010',
      blogUrlTemplate: 'https://trueu.ai/blog/{slug}',
      leadMagnet: '',
      icpSegment: '',
    });
    expect(input.cta.blog_url).toBe('https://trueu.ai/blog/how-to-think-through-ai-upskilling');
    expect(input.cta.category).toBe('Work & Meaning');
    expect(input.cta.key_points.length).toBeGreaterThanOrEqual(3);
    expect(input.poll.topic).toBe('Learn or leave?');
    expect(input.poll.key_themes.startsWith('Security; ')).toBe(true);
  });
});
