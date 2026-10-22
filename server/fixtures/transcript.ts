// Mock-mode transcript: a 10-minute talk, so the whole flow can be tried without the worker.
import type { Segment } from '../transcripts.js';

const lines = [
  'Welcome. Today we talk about the quiet flatness that can follow a big career win.',
  'You reached the goal you worked toward for years, and the feeling you expected did not come.',
  'That reaction is far more common than people say out loud.',
  'First, let us look at what the goal was really standing in for.',
  'Often it stood in for meaning, not just for a title or a salary.',
  'Second, consider what you noticed first when the excitement faded.',
  'That detail is information about what you actually need.',
  'Third, ask what a good week would look like if nobody were watching.',
  'Small honest answers here beat big dramatic plans.',
  'Finally, give yourself permission to change the question instead of the job.',
];

export const mockSegments: Segment[] = Array.from({ length: 40 }, (_, i) => ({
  s: i * 15,
  e: i * 15 + 14,
  t: lines[i % lines.length]!,
}));
export const mockDurationSec = 600;
