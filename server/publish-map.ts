// Which approved caption (Content Item) and which video file a scheduled post publishes.
// Pure; tested in server/tests/publish.test.ts.

const CHANNEL: Record<string, string> = {
  youtube: 'youtube',
  youtube_shorts: 'youtube',
  instagram_reels: 'reels_tiktok',
  tiktok: 'reels_tiktok',
  instagram_feed: 'instagram',
  facebook: 'facebook',
  x: 'twitter',
  threads: 'threads',
  pinterest: 'pinterest',
  linkedin: 'linkedin',
};

/** The Content Item (Channel + Post) behind a post, or null for blog / newsletter / unknown. */
export function contentKey(
  platform: string,
  assetRole: string | null,
): { channel: string; post: string } | null {
  const channel = CHANNEL[platform];
  if (!channel || !assetRole) return null;
  if (assetRole === 'long_video') return { channel, post: 'long_video' };
  const n = /^short_([123])$/.exec(assetRole)?.[1];
  return n ? { channel, post: `video_${n}` } : null;
}

const VIDEO = /\.(mp4|mov|m4v|webm)$/i;
export const isVideoFile = (name: string) => VIDEO.test(name);

/**
 * Short number from a file name: "short 2", "Short_2", "s2", "TrueU - Short 3 final.mp4", "2.mp4".
 * Null when it can't be told (the file is then listed for the owner to assign).
 */
export function shortNumber(fileName: string): 1 | 2 | 3 | null {
  const base = fileName.replace(/\.[^.]+$/, '');
  const of3 = /(?:^|\D)([123])\s*of\s*3(?!\d)/i.exec(base)?.[1]; // "1of3", "2 of 3"
  if (of3) return Number(of3) as 1 | 2 | 3;
  const m =
    /(?:short|shorts|s|clip|video|part)[\s_\-#]*([123])(?!\d)/i.exec(base) ??
    /^\s*([123])\s*$/.exec(base);
  return m ? (Number(m[1]) as 1 | 2 | 3) : null;
}

/** Dropbox view link → direct download link (what Metricool / Make fetch). */
export function directLink(shared: string): string {
  const url = new URL(shared);
  url.searchParams.set('dl', '1');
  return url.toString();
}

/** The platforms one Content Item is posted on (Reels and TikTok share a caption). */
export function platformsFor(channel: string, post: string): string[] {
  if (channel === 'youtube') return [post === 'long_video' ? 'youtube' : 'youtube_shorts'];
  return Object.entries(CHANNEL)
    .filter(([platform, c]) => c === channel && !platform.startsWith('youtube'))
    .map(([platform]) => platform);
}

/** The environment variable holding each platform's Make.com webhook URL. */
export const WEBHOOK_ENV: Record<string, string> = {
  facebook: 'MAKE_WEBHOOK_FACEBOOK',
  instagram_reels: 'MAKE_WEBHOOK_INSTAGRAM',
  instagram_feed: 'MAKE_WEBHOOK_INSTAGRAM',
  tiktok: 'MAKE_WEBHOOK_TIKTOK',
  youtube_shorts: 'MAKE_WEBHOOK_YOUTUBE_SHORTS',
  youtube: 'MAKE_WEBHOOK_YOUTUBE_LONG',
  threads: 'MAKE_WEBHOOK_THREADS',
  x: 'MAKE_WEBHOOK_TWITTER',
  pinterest: 'MAKE_WEBHOOK_PINTEREST',
};

export interface PostFields {
  video_title: string;
  video_url: string;
  post_content: string;
  hashtags: string;
}

/**
 * What each platform's Make scenario receives (the client's list, 2026-10-22):
 * Facebook, Instagram, YouTube Shorts, YouTube Long: video title, video URL, post content, hashtags.
 * TikTok: video URL, post content, hashtags. Threads, X, Pinterest: post content, hashtags, URL.
 * "URL" for Threads / X / Pinterest is the video link (confirmed by the client, 2026-10-22).
 */
export function webhookBody(platform: string, f: PostFields): Record<string, string> {
  switch (platform) {
    case 'tiktok':
      return { video_url: f.video_url, post_content: f.post_content, hashtags: f.hashtags };
    case 'threads':
    case 'x':
    case 'pinterest':
      return { post_content: f.post_content, hashtags: f.hashtags, url: f.video_url };
    default:
      return {
        video_title: f.video_title,
        video_url: f.video_url,
        post_content: f.post_content,
        hashtags: f.hashtags,
      };
  }
}
