// @vitest-environment node
import { Document, Packer, Paragraph } from 'docx';
import { describe, expect, it } from 'vitest';
import { fileText } from '../transcript-file.js';
import { applyTranscript, chapterCandidates, segmentsFromText } from '../transcripts.js';

const timedText = Array.from(
  { length: 12 },
  (_, i) =>
    `${Math.floor((i * 60) / 60)}:${String((i * 60) % 60).padStart(2, '0')} Point ${i + 1} is made clearly here.`,
).join('\n');

describe('segmentsFromText', () => {
  it('reads "m:ss text" lines as timed segments', () => {
    const s = segmentsFromText(timedText);
    expect(s).toHaveLength(12);
    expect(s[1]).toMatchObject({ s: 60, e: 120, t: 'Point 2 is made clearly here.' });
  });

  it('reads bracketed hh:mm:ss and joins wrapped lines', () => {
    const s = segmentsFromText(
      '[00:00:05] First part\ncontinues here\n[00:01:10] Second\n[00:02:00] Third',
    );
    expect(s.map((x) => x.s)).toEqual([5, 70, 120]);
    expect(s[0]!.t).toBe('First part continues here');
  });

  it('reads SRT cues', () => {
    const srt = [1, 2, 3]
      .map((n) => `${n}\n00:0${n}:00,000 --> 00:0${n}:04,000\nCue number ${n}`)
      .join('\n\n');
    expect(segmentsFromText(srt).map((x) => x.s)).toEqual([60, 120, 180]);
  });

  it('keeps a plain transcript as untimed paragraphs that give a summary but no chapters', () => {
    const s = segmentsFromText('First paragraph.\n\nSecond paragraph.\n\nThird.');
    expect(s).toHaveLength(3);
    expect(s.every((x) => x.e === 0)).toBe(true);
    expect(chapterCandidates(s, 600)).toEqual([]);
    const out = applyTranscript(
      { video_duration: '10:00', duration_seconds: 600, script_summary: '', key_timestamps: [] },
      'long_video',
      { segments: s, durationSec: 0 },
    );
    expect(out.duration_seconds).toBe(600);
    expect(out.script_summary).toMatch(/First paragraph/);
    expect(out.key_timestamps).toEqual([]);
  });
});

describe('fileText', () => {
  it('reads a Word file', async () => {
    const doc = new Document({
      sections: [{ children: [new Paragraph('0:00 Hello there'), new Paragraph('0:30 Next')] }],
    });
    const text = await fileText('transcript.docx', new Uint8Array(await Packer.toBuffer(doc)));
    expect(text).toContain('0:30 Next');
  });

  it('reads plain text', async () => {
    expect(await fileText('t.txt', new TextEncoder().encode('hi'))).toBe('hi');
  });
});
