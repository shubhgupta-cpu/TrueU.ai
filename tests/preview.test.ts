import { describe, expect, it } from 'vitest';
import { layoutOf, visibleText } from '@/lib/preview';

describe('preview', () => {
  it('picks a layout per platform', () => {
    expect(layoutOf('instagram_reels')).toBe('vertical');
    expect(layoutOf('x')).toBe('text');
    expect(layoutOf('facebook')).toBe('feed');
    expect(layoutOf('pinterest')).toBe('pin');
    expect(layoutOf('youtube')).toBe('youtube');
  });

  it('folds long captions where the platform does', () => {
    expect(visibleText('tiktok', 'short')).toEqual({ shown: 'short', folded: false });
    const r = visibleText('tiktok', 'x'.repeat(200));
    expect(r.folded).toBe(true);
    expect(r.shown.length).toBe(101);
  });
});
