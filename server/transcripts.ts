// Turns the editor's transcript file (PDF / Word / text, read in transcript-file.ts) into what the YouTube
// metadata prompt needs: real chapter timestamps and a summary of what is actually said in the video.
// Pure; tested in server/tests/transcripts.test.ts.

export interface Segment {
  /** Start and end in seconds. */
  s: number;
  e: number;
  t: string;
}

export const mmss = (sec: number): string =>
  `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

/** Reads the Segments JSON; anything malformed is dropped rather than failing the whole run. */
export function parseSegments(json: string | null | undefined): Segment[] {
  if (!json) return [];
  try {
    const raw = JSON.parse(json) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(
        (x): x is Segment =>
          !!x &&
          typeof x.s === 'number' &&
          typeof x.e === 'number' &&
          typeof x.t === 'string' &&
          x.t.trim() !== '',
      )
      .map((x) => ({ s: x.s, e: x.e, t: x.t.trim() }))
      .sort((a, b) => a.s - b.s);
  } catch {
    return [];
  }
}

/** A transcript without times has every segment at 0. */
export const isTimed = (segments: Segment[]): boolean => segments.some((x) => x.e > 0);

const STAMP = /^[[(]?((?:\d{1,2}:)?\d{1,2}:\d{2})(?:[.,]\d+)?[\])]?\s*(?:-->.*?)?[-–—:]?\s*(.*)$/;
const toSeconds = (stamp: string): number =>
  stamp.split(':').reduce((n, part) => n * 60 + Number(part), 0);

/**
 * Reads a transcript's text. Lines that start with a time ("0:42 text", "[00:01:05] text", SRT/VTT cues)
 * give a timed transcript; plain text becomes untimed paragraphs (summary only: no chapter times can be known).
 */
export function segmentsFromText(raw: string): Segment[] {
  const text = raw.replace(/\r/g, '');
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && l !== 'WEBVTT' && !/^\d+$/.test(l));
  const timed: Array<{ s: number; t: string }> = [];
  for (const line of lines) {
    const m = STAMP.exec(line);
    if (m) timed.push({ s: toSeconds(m[1]!), t: m[2]!.trim() });
    else if (timed.length) timed[timed.length - 1]!.t += ` ${line}`;
  }
  if (timed.length >= 3) {
    return timed
      .filter((x) => x.t)
      .map((x, i, all) => {
        const end = all[i + 1]?.s ?? x.s + Math.max(5, x.t.split(/\s+/).length / 2.5);
        return { s: x.s, e: Math.max(end, x.s + 1), t: x.t };
      });
  }
  // No times: one segment per paragraph.
  return text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((t) => ({ s: 0, e: 0, t }));
}

/** The first sentence (or the first ~12 words) of a block of speech, as a chapter label. */
function label(text: string): string {
  const first = text.split(/(?<=[.!?])\s/)[0] ?? text;
  const words = first.replace(/\s+/g, ' ').trim().split(' ');
  const cut = words.slice(0, 12).join(' ');
  return words.length > 12 ? `${cut}…` : cut;
}

/**
 * Chapter candidates from the spoken words: one block of roughly 45–90 s, starting at a sentence,
 * with the real time it starts. The first is always 0:00 (YouTube needs it). Videos under 60 s get none.
 * The prompt turns these into the final chapter titles.
 */
export function chapterCandidates(
  segments: Segment[],
  durationSec: number,
  maxChapters = 12,
): Array<{ timestamp: string; description: string }> {
  if (segments.length === 0 || durationSec < 60 || !isTimed(segments)) return [];
  const target = Math.max(45, durationSec / maxChapters);
  const out: Array<{ timestamp: string; description: string }> = [
    { timestamp: '0:00', description: 'Introduction' },
  ];
  let blockStart = 0;
  for (const seg of segments) {
    if (seg.s - blockStart >= target && durationSec - seg.s >= 15) {
      out.push({ timestamp: mmss(seg.s), description: label(seg.t) });
      blockStart = seg.s;
    }
  }
  return out.slice(0, maxChapters);
}

/** A ≤ `max`-character summary of what is said, sampled across the whole video (start, middle, end). */
export function summaryFromSegments(segments: Segment[], max = 500): string {
  if (segments.length === 0) return '';
  const total = segments.at(-1)!.e || 1;
  const timed = isTimed(segments);
  const picks: string[] = [];
  // One sentence from each tenth of the video, in order.
  for (let i = 0; i < 10; i++) {
    const from = (total * i) / 10;
    const seg = timed
      ? segments.find((x) => x.s >= from)
      : segments[Math.floor((segments.length * i) / 10)];
    const sentence = seg ? label(seg.t) : '';
    if (sentence && !picks.includes(sentence)) picks.push(sentence);
  }
  let out = '';
  for (const p of picks) {
    const next = out ? `${out} ${p}` : p;
    if (next.length > max) break;
    out = next;
  }
  return out;
}

/** Words per minute: a sanity check that the transcript covers the video (a near-empty one is a bad transcript). */
export function wordsPerMinute(segments: Segment[], durationSec: number): number {
  const words = segments.reduce((n, s) => n + s.t.split(/\s+/).length, 0);
  return durationSec > 0 ? Math.round((words / durationSec) * 60) : 0;
}

type Video = 'long_video' | 'video_1' | 'video_2' | 'video_3';

interface YtInput {
  video_duration: string;
  duration_seconds: number;
  script_summary: string;
  key_timestamps: Array<{ timestamp: string; description: string }>;
}

const clip500 = (s: string) => (s.length <= 500 ? s : `${s.slice(0, 497).replace(/\s+\S*$/, '')}…`);

/**
 * Replaces the script-based timing and summary with what the finished video really says: its true
 * length, a summary of the words spoken, and (long video only) chapter candidates at the real times.
 */
export function applyTranscript<I extends YtInput>(
  input: I,
  video: Video,
  tx: { segments: Segment[]; durationSec: number },
): I {
  const duration = Math.round(tx.durationSec) || input.duration_seconds; // untimed: the script's estimate
  const said = summaryFromSegments(tx.segments, 420);
  return {
    ...input,
    video_duration: mmss(duration),
    duration_seconds: duration,
    script_summary:
      video === 'long_video'
        ? clip500(`The finished video says: ${said}`)
        : clip500(
            `Short ${video.slice(-1)} of 3, cut from the long episode. Its title must be built on this clip's own hook and differ from the long video and the other two shorts. It says: ${said}`,
          ),
    key_timestamps: video === 'long_video' ? chapterCandidates(tx.segments, duration) : [],
  };
}
