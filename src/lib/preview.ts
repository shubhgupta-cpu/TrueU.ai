// How a platform shows a post. Limits mirror settings.platform_rules / docs/publishing-schedule.md §5.

export type PreviewLayout = 'vertical' | 'feed' | 'text' | 'pin' | 'youtube';

export const PLATFORM_LABEL: Record<string, string> = {
  youtube: 'YouTube',
  youtube_shorts: 'YouTube Shorts',
  instagram_reels: 'Instagram Reels',
  instagram_feed: 'Instagram Feed',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  x: 'X (Twitter)',
  threads: 'Threads',
  pinterest: 'Pinterest',
  linkedin: 'LinkedIn',
};

export const layoutOf = (platform: string): PreviewLayout =>
  platform === 'youtube'
    ? 'youtube'
    : ['youtube_shorts', 'instagram_reels', 'tiktok'].includes(platform)
      ? 'vertical'
      : ['x', 'threads'].includes(platform)
        ? 'text'
        : platform === 'pinterest'
          ? 'pin'
          : 'feed';

/** Characters visible before the platform folds the text behind "more". */
export const VISIBLE_CHARS: Record<string, number> = {
  youtube: 157,
  instagram_reels: 125,
  instagram_feed: 125,
  tiktok: 100,
  facebook: 125,
  linkedin: 210,
  x: 280,
  threads: 500,
  pinterest: 500,
  youtube_shorts: 100,
};

/** The text the platform shows first, and whether the rest is folded away. */
export function visibleText(platform: string, text: string): { shown: string; folded: boolean } {
  const limit = VISIBLE_CHARS[platform] ?? 125;
  return text.length <= limit
    ? { shown: text, folded: false }
    : { shown: `${text.slice(0, limit).trimEnd()}…`, folded: true };
}
