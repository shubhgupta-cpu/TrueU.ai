// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  applyTranscript,
  chapterCandidates,
  mmss,
  parseSegments,
  summaryFromSegments,
  wordsPerMinute,
  type Segment,
} from '../transcripts.js';

// A 10-minute talk: a sentence every 20 s.
const talk: Segment[] = Array.from({ length: 30 }, (_, i) => ({
  s: i * 20,
  e: i * 20 + 19,
  t: `Sentence number ${i + 1} says something specific about the topic. And more words follow it.`,
}));

describe('transcript → chapters', () => {
  it('formats times', () => {
    expect(mmss(0)).toBe('0:00');
    expect(mmss(605)).toBe('10:05');
  });

  it('starts at 0:00 and uses the real times of what is said', () => {
    const c = chapterCandidates(talk, 600);
    expect(c[0]).toEqual({ timestamp: '0:00', description: 'Introduction' });
    expect(c.length).toBeGreaterThanOrEqual(5);
    expect(c.length).toBeLessThanOrEqual(12);
    // every candidate time is a time at which a sentence really starts
    for (const x of c.slice(1)) {
      const [m, s] = x.timestamp.split(':').map(Number);
      expect(talk.some((t) => t.s === m! * 60 + s!)).toBe(true);
    }
    expect(c[1]!.description).toMatch(/^Sentence number/);
  });

  it('gives no chapters for a very short video or an empty transcript', () => {
    expect(chapterCandidates(talk.slice(0, 2), 40)).toEqual([]);
    expect(chapterCandidates([], 600)).toEqual([]);
  });

  it('summarises across the whole video within the limit', () => {
    const s = summaryFromSegments(talk, 500);
    expect(s.length).toBeLessThanOrEqual(500);
    expect(s).toMatch(/Sentence number 1 /);
    expect(s).toMatch(/Sentence number (2[0-9]|1[0-9]) /); // reaches past the middle
  });

  it('drops malformed segments instead of failing', () => {
    expect(parseSegments('not json')).toEqual([]);
    expect(
      parseSegments(JSON.stringify([{ s: 1, e: 2, t: ' hi ' }, { s: 'x' }, { s: 3, e: 4, t: '' }])),
    ).toEqual([{ s: 1, e: 2, t: 'hi' }]);
  });

  it('measures words per minute', () => {
    expect(wordsPerMinute(talk, 600)).toBeGreaterThan(20);
    expect(wordsPerMinute([], 600)).toBe(0);
  });
});

describe('applying a transcript to the YouTube input', () => {
  const scriptInput = {
    video_duration: '11:00',
    duration_seconds: 660,
    script_summary: 'from the script',
    key_timestamps: [{ timestamp: '0:00', description: 'from the script' }],
  };

  it('replaces the length, summary and chapters of the long video with what the video really has', () => {
    const out = applyTranscript(scriptInput, 'long_video', { segments: talk, durationSec: 600 });
    expect(out.video_duration).toBe('10:00');
    expect(out.duration_seconds).toBe(600);
    expect(out.script_summary).toMatch(/^The finished video says: Sentence number 1/);
    expect(out.script_summary.length).toBeLessThanOrEqual(500);
    expect(out.key_timestamps[0]).toEqual({ timestamp: '0:00', description: 'Introduction' });
    expect(out.key_timestamps.some((k) => k.description === 'from the script')).toBe(false);
  });

  it('keeps a short free of chapters and tells the prompt its title must differ', () => {
    const out = applyTranscript(scriptInput, 'video_2', {
      segments: talk.slice(0, 3),
      durationSec: 45,
    });
    expect(out.video_duration).toBe('0:45');
    expect(out.key_timestamps).toEqual([]);
    expect(out.script_summary).toMatch(/^Short 2 of 3/);
    expect(out.script_summary).toMatch(/differ from the long video/);
  });
});
