import { describe, expect, it } from 'vitest';
import { parseHashtags } from '@/features/settings/logic';

describe('parseHashtags', () => {
  it('adds # and splits on spaces and commas', () => {
    expect(parseHashtags('TrueUai, #Career  growth')).toEqual(['#TrueUai', '#Career', '#growth']);
  });
  it('drops repeats and empty input', () => {
    expect(parseHashtags('#a #a')).toEqual(['#a']);
    expect(parseHashtags('  ')).toEqual([]);
  });
});
