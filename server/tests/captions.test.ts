// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { validateOutput } from '../claude.js';
import { claudeFixtures } from '../fixtures/index.js';
import { Blog } from '../schemas/blog.js';
import {
  Captions,
  captionInput,
  flattenPosts,
  postText,
  postWarnings,
  setWarnings,
} from '../schemas/captions.js';
import { Script } from '../schemas/script.js';

const fixture = claudeFixtures.captions_generate![0];
const captions = Captions.parse(fixture);

describe('social captions (Social Media Content Generator v2.4)', () => {
  it('has 28 posts: 4 per standard channel, 1 carousel, 3 reels/TikTok', () => {
    const posts = flattenPosts(captions);
    expect(posts).toHaveLength(28);
    expect(posts.filter((p) => p.channel === 'linkedin_carousel').map((p) => p.slot)).toEqual([
      'image',
    ]);
    expect(posts.filter((p) => p.channel === 'reels_tiktok').map((p) => p.slot)).toEqual([
      'video_1',
      'video_2',
      'video_3',
    ]);
    expect(flattenPosts(captions, 'instagram')).toHaveLength(4);
  });

  it('passes the prompt rules when they are followed', () => {
    for (const p of flattenPosts(captions)) expect(postWarnings(p.channel, p.post)).toEqual([]);
    expect(setWarnings(captions)).toEqual([]);
  });

  it('requires every channel', () => {
    const raw = structuredClone(fixture) as Record<string, unknown>;
    expect(Captions.safeParse({ ...raw, pinterest: undefined }).success).toBe(false);
  });

  it('joins a hashtag array instead of losing it', () => {
    const raw = structuredClone(fixture) as { threads: { image: { hashtags: unknown } } };
    raw.threads.image.hashtags = ['#TrueUai', '#ThinkingPartner', '#Career'];
    const v = validateOutput(JSON.stringify(raw), Captions);
    expect(v.ok && v.data.threads.image.hashtags).toBe('#TrueUai #ThinkingPartner #Career');
  });

  it('flags limits, hashtag policy and em dashes per post', () => {
    const c = Captions.parse(structuredClone(fixture));
    c.twitter.image.caption = 'x'.repeat(300);
    c.twitter.image.graphic_quote = 'q'.repeat(120);
    c.twitter.image.hashtags = '#ThinkingPartner, #Career';
    expect(postWarnings('twitter', c.twitter.image)).toEqual(
      expect.arrayContaining([
        'caption is 300 characters (target 200–280)',
        'graphic_quote is 120 characters (max 100)',
        '2 hashtags (exactly 3 required)',
        'Hashtags are comma-separated (single spaces required)',
        'The first hashtag must be #TrueUai',
      ]),
    );
    c.facebook.video_1.caption = `${c.facebook.video_1.caption} — and #Bonus`;
    const w = postWarnings('facebook', c.facebook.video_1);
    expect(w).toContain('Contains an em dash');
    expect(w).toContain('A hashtag appears inside the caption or graphic text');
  });

  it('reads Pinterest text from "description" and checks carousel slides', () => {
    expect(postText('pinterest', captions.pinterest.image)).toBe(
      captions.pinterest.image.description,
    );
    const c = Captions.parse(structuredClone(fixture));
    c.linkedin_carousel.image.slides = [{ headline: 'h'.repeat(45), body: 'b' }];
    expect(postWarnings('linkedin_carousel', c.linkedin_carousel.image)).toEqual(
      expect.arrayContaining([
        '1 carousel slides (4–5 recommended)',
        'Slide 1 headline is 45 characters (max 40)',
      ]),
    );
  });

  it('fills the prompt inputs from the script, blog and settings', () => {
    const input = captionInput({
      topicTitle: 'Learn or leave?',
      category: null,
      script: Script.parse(claudeFixtures.script_generate![0]),
      blog: Blog.parse(claudeFixtures.blog_generate![0]),
      urlTemplate: 'https://trueu.ai/blog/{slug}?utm_campaign={slug}',
      weeklyHashtags: [],
    });
    expect(input.content_url).toBe(
      'https://trueu.ai/blog/how-to-think-through-ai-upskilling?utm_campaign=how-to-think-through-ai-upskilling',
    );
    expect(input.content_type).toBe('video');
    expect(input.weekly_hashtags).toEqual(['#CommonGround', '#Security']); // script hashtags minus brand tags
    expect(input.decision_domain).toBe('Security');
  });
});
