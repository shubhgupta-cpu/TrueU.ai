// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { claudeFixtures } from '../fixtures/index.js';
import { Script } from '../schemas/script.js';
import {
  descriptionHashtags,
  duplicateTitleWarnings,
  toSeconds,
  YouTubeMeta,
  youtubeInput,
  youtubeWarnings,
} from '../schemas/youtube.js';

const meta = YouTubeMeta.parse(claudeFixtures.youtube_metadata_generate![0]);
const script = Script.parse(claudeFixtures.script_generate![0]);
const evaluation = {
  criteria_scores: { search_intent: { search_phrases: ['is ai upskilling worth it', 'b', 'c'] } },
};

describe('YouTube SEO metadata (v2.0)', () => {
  it('passes the checklist when the rules are followed', () => {
    expect(youtubeWarnings(meta, 'long_video', 660, 'is ai upskilling worth it')).toEqual([]);
  });

  it('flags title, thumbnail, description, tags and timestamps', () => {
    const m = YouTubeMeta.parse(structuredClone(claudeFixtures.youtube_metadata_generate![0]));
    m.titles.recommended = 'Too short';
    m.thumbnail_text_options[0]!.headline = 'A HEADLINE THAT IS FAR TOO LONG';
    m.description.full_text = 'Short description without the brand section. #TrueUai';
    m.tags = m.tags.slice(0, 8);
    const w = youtubeWarnings(m, 'long_video', 660, 'is ai upskilling worth it').join('\n');
    expect(w).toContain('Recommended title is 9 characters');
    expect(w).toContain('doesn’t include the primary keyword');
    expect(w).toContain('Thumbnail 1 headline is 31 characters (max 25)');
    expect(w).toContain('Description is');
    expect(w).toContain('No timestamps, though the video is over 10 minutes');
    expect(w).toContain('"About TrueU.ai" section is missing');
    expect(w).toContain('8 tags (15–20 expected)');
  });

  it('flags videos that share a title', () => {
    const w = duplicateTitleWarnings({
      long_video: 'A',
      video_1: 'Same title',
      video_2: 'same title ',
      video_3: 'C',
    });
    expect(Object.keys(w).sort()).toEqual(['video_1', 'video_2']);
    expect(w.video_1).toContain('Same title as Short 2');
  });

  it('reads the hashtags at the end of the description', () => {
    expect(descriptionHashtags('Text\n\n#TrueUai #ThinkingPartner  #Career\n')).toBe(
      '#TrueUai #ThinkingPartner #Career',
    );
    expect(descriptionHashtags('No tags here')).toBe('');
  });

  it('builds the long video input: duration, scene timestamps, ≤500-char summary', () => {
    const input = youtubeInput({
      video: 'long_video',
      topicTitle: 'T',
      category: 'Transitions',
      script,
      evaluation,
      videoId: 'vid1',
    });
    expect(input.video_duration).toBe('11:00');
    expect(input.duration_seconds).toBe(660);
    expect(input.decision_domain).toBe('Life Transition');
    expect(input.key_timestamps[0]).toEqual({ timestamp: '0:00', description: 'Introduction' });
    expect(input.key_timestamps.at(-1)?.description).toBe(
      'TrueU.ai: Your Private Thinking Partner',
    );
    expect(input.script_summary.length).toBeLessThanOrEqual(500);
    expect(input.primary_keyword).toBe('is ai upskilling worth it');
    expect(input.secondary_keywords.length).toBeLessThanOrEqual(7);
  });

  it('builds a short input from its clip timecode and hook', () => {
    const input = youtubeInput({
      video: 'video_2',
      topicTitle: 'T',
      category: null,
      script,
      evaluation,
      videoId: 'vid2',
    });
    expect(input.video_duration).toBe('0:45'); // 5:45-6:30
    expect(input.key_timestamps).toEqual([]);
    expect(input.script_summary).toContain('5:45-6:30');
    expect(input.decision_domain).toBe('Personal Growth');
    expect(toSeconds('1:02:03')).toBe(3723);
  });
});
