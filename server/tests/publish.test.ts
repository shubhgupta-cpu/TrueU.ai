// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { classify } from '../jobs/uploads.js';
import {
  contentKey,
  webhookBody,
  WEBHOOK_ENV,
  directLink,
  isVideoFile,
  shortNumber,
} from '../publish-map.js';

describe('publish map', () => {
  it('maps a post to its approved caption', () => {
    expect(contentKey('instagram_reels', 'short_2')).toEqual({
      channel: 'reels_tiktok',
      post: 'video_2',
    });
    expect(contentKey('tiktok', 'short_3')).toEqual({ channel: 'reels_tiktok', post: 'video_3' });
    expect(contentKey('x', 'short_1')).toEqual({ channel: 'twitter', post: 'video_1' });
    expect(contentKey('youtube', 'long_video')).toEqual({ channel: 'youtube', post: 'long_video' });
    expect(contentKey('youtube_shorts', 'short_3')).toEqual({
      channel: 'youtube',
      post: 'video_3',
    });
    expect(contentKey('blog', null)).toBeNull();
  });

  it('reads the short number from a file name', () => {
    expect(shortNumber('Short 2.mp4')).toBe(2);
    expect(shortNumber('TrueU_short_3_final.mov')).toBe(3);
    expect(shortNumber('S1.mp4')).toBe(1);
    expect(shortNumber('3.mp4')).toBe(3);
    expect(shortNumber('TRUEU-SHORT-13-MIDCAREER_CRISIS-1of3-FINAL.mp4')).toBe(1);
    expect(shortNumber('TRUEU-SHORT-15-MIDCAREER_CRISIS-3of3-FINAL.mp4')).toBe(3);
    expect(shortNumber('TRUEU-SHORT-14-X-2 of 3.mp4')).toBe(2);
    expect(shortNumber('final cut v2.mp4')).toBeNull();
    expect(shortNumber('Short 12.mp4')).toBeNull();
  });

  it('knows video files and builds a direct link', () => {
    expect(isVideoFile('a.MP4')).toBe(true);
    expect(isVideoFile('a.docx')).toBe(false);
    expect(directLink('https://www.dropbox.com/s/abc/x.mp4?dl=0')).toBe(
      'https://www.dropbox.com/s/abc/x.mp4?dl=1',
    );
    expect(directLink('https://www.dropbox.com/scl/fi/abc/x.mp4?rlkey=k&dl=0')).toContain('dl=1');
  });
});

describe('webhook payloads (client list)', () => {
  const f = { video_title: 'T', video_url: 'U', post_content: 'C', hashtags: '#h' };
  it('sends each platform only what its scenario needs', () => {
    expect(Object.keys(webhookBody('facebook', f)).sort()).toEqual([
      'hashtags',
      'post_content',
      'video_title',
      'video_url',
    ]);
    expect(Object.keys(webhookBody('instagram_reels', f)).sort()).toEqual([
      'hashtags',
      'post_content',
      'video_title',
      'video_url',
    ]);
    expect(Object.keys(webhookBody('youtube_shorts', f)).sort()).toEqual([
      'hashtags',
      'post_content',
      'video_title',
      'video_url',
    ]);
    expect(Object.keys(webhookBody('tiktok', f)).sort()).toEqual([
      'hashtags',
      'post_content',
      'video_url',
    ]);
    for (const p of ['threads', 'x', 'pinterest'])
      expect(Object.keys(webhookBody(p, f)).sort()).toEqual(['hashtags', 'post_content', 'url']);
  });
  it('has a webhook for every platform that is scheduled, and Reels + Feed share Instagram', () => {
    for (const p of [
      'youtube',
      'youtube_shorts',
      'instagram_reels',
      'instagram_feed',
      'tiktok',
      'facebook',
      'x',
      'threads',
      'pinterest',
    ])
      expect(WEBHOOK_ENV[p]).toBeTruthy();
    expect(WEBHOOK_ENV['instagram_reels']).toBe(WEBHOOK_ENV['instagram_feed']);
  });
});

describe('upload classification', () => {
  const f = (name: string) => ({ id: `id:${name}`, rev: 'r', name, path: `/x/${name}`, size: 1 });
  it('takes the newest long video and numbers the shorts by file name', () => {
    const out = classify(
      [f('old.mp4'), f('final.mp4'), f('notes.txt')],
      [f('Short 2.mp4'), f('short_1.mov'), f('mystery.mp4'), f('cover.png')],
    );
    expect(out.map((x) => [x.name, x.role])).toEqual([
      ['final.mp4', 'long_video'],
      ['Short 2.mp4', 'short_2'],
      ['short_1.mov', 'short_1'],
      ['mystery.mp4', 'other'],
    ]);
  });
});
