import { useQuery } from '@tanstack/react-query';
import { Check, Copy, Linkedin, Maximize2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { layoutOf, PLATFORM_LABEL, VISIBLE_CHARS } from '@/lib/preview';
import { cn } from '@/lib/utils';
import type { PostPreview } from '@/types/api';
import { BRAND_MARKS } from './brand-marks';

/** Which brand mark labels a platform (Reels and Feed are both Instagram, Shorts is YouTube). */
const MARK_OF: Record<string, string> = {
  youtube: 'youtube',
  youtube_shorts: 'youtube',
  instagram_reels: 'instagram',
  instagram_feed: 'instagram',
  tiktok: 'tiktok',
  facebook: 'facebook',
  x: 'x',
  threads: 'threads',
  pinterest: 'pinterest',
};

export function PlatformMark({ platform, className }: { platform: string; className?: string }) {
  const mark = BRAND_MARKS[MARK_OF[platform] ?? ''];
  if (!mark) return <Linkedin aria-hidden className={cn('h-5 w-5 text-[#0A66C2]', className)} />;
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={cn('h-5 w-5 shrink-0', className)}
      fill={mark.color}
    >
      <path d={mark.path} />
    </svg>
  );
}

/** The editor's video, streamed through a short-lived Dropbox link. */
function Video({ id, className }: { id: string | null; className: string }) {
  const link = useQuery({
    queryKey: ['video-link', id],
    enabled: !!id,
    queryFn: () => api<{ url: string }>(`/assets/${id}/video`),
    staleTime: 3 * 60 * 60_000, // links last about 4 hours
  });
  if (!id) return <Missing className={className} text="Video not uploaded to Dropbox yet" />;
  if (link.isError) return <Missing className={className} text="Could not load the video" />;
  if (!link.data?.url)
    return (
      <Missing className={className} text={link.isLoading ? 'Loading video…' : 'No video link'} />
    );
  return (
    <video
      src={link.data.url}
      controls
      preload="metadata"
      playsInline
      className={cn('bg-black object-contain', className)}
    />
  );
}

function Missing({ className, text }: { className: string; text: string }) {
  return (
    <div
      className={cn(
        'flex items-center justify-center bg-ink/90 p-4 text-center text-xs text-white/80',
        className,
      )}
    >
      {text}
    </div>
  );
}

const statusText = (p: PostPreview) =>
  p.status === 'approved' ? 'Approved' : `Not approved (${p.status})`;
const fullText = (p: PostPreview) => (p.hashtags ? `${p.caption}\n\n${p.hashtags}` : p.caption);

/** Every card is the same shape: platform header, video, a short text excerpt, and a button for the full post. */
export function PostPreviewCard({ post }: { post: PostPreview }) {
  const [open, setOpen] = useState(false);
  const layout = layoutOf(post.platform);
  return (
    <>
      <figure className="flex h-full flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
        <figcaption className="flex items-center justify-between gap-2 border-b border-line px-3 py-2.5">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <PlatformMark platform={post.platform} />
            {PLATFORM_LABEL[post.platform] ?? post.platform}
          </span>
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-xs font-medium',
              post.status === 'approved'
                ? 'bg-success-soft text-success'
                : 'bg-warning-soft text-warning',
            )}
          >
            {post.status === 'approved' ? 'Approved' : 'Not approved'}
          </span>
        </figcaption>
        <div className={cn('bg-black', layout === 'youtube' ? 'aspect-video' : 'h-[360px]')}>
          <Video id={post.video_id} className="h-full w-full" />
        </div>
        <div className="flex flex-1 flex-col gap-2 p-3">
          {post.title && <p className="line-clamp-2 text-sm font-semibold">{post.title}</p>}
          <p className="line-clamp-4 whitespace-pre-line text-sm">{post.caption}</p>
          {post.hashtags && <p className="line-clamp-1 text-xs text-info">{post.hashtags}</p>}
          <Button
            variant="outline"
            size="sm"
            className="mt-auto w-full"
            onClick={() => setOpen(true)}
            aria-label={`View full preview: ${PLATFORM_LABEL[post.platform] ?? post.platform}`}
          >
            <Maximize2 aria-hidden className="h-3.5 w-3.5" />
            View full preview
          </Button>
        </div>
      </figure>
      <FullPreview post={post} open={open} onOpenChange={setOpen} />
    </>
  );
}

/** The whole post: larger video, the complete caption and hashtags, and a copy button. */
function FullPreview({
  post,
  open,
  onOpenChange,
}: {
  post: PostPreview;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [copied, setCopied] = useState(false);
  const limit = VISIBLE_CHARS[post.platform];
  const total = post.caption.length + (post.hashtags ? post.hashtags.length + 2 : 0);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(fullText(post));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the text is selectable on screen.
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogTitle className="flex items-center gap-2">
          <PlatformMark platform={post.platform} className="h-6 w-6" />
          {PLATFORM_LABEL[post.platform] ?? post.platform}
        </DialogTitle>
        <DialogDescription>{statusText(post)}</DialogDescription>
        <div className="mt-4 grid gap-6 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <div
            className={cn(
              'overflow-hidden rounded-lg bg-black',
              layoutOf(post.platform) === 'youtube' ? 'aspect-video' : 'h-[60vh] max-h-[560px]',
            )}
          >
            {open && <Video id={post.video_id} className="h-full w-full" />}
          </div>
          <div className="min-w-0 space-y-4">
            {post.title && (
              <div>
                <p className="text-xs uppercase tracking-wider text-muted">Title</p>
                <p className="font-semibold">{post.title}</p>
              </div>
            )}
            <div>
              <p className="text-xs uppercase tracking-wider text-muted">Caption</p>
              <p className="select-text whitespace-pre-line break-words text-sm">{post.caption}</p>
            </div>
            {post.hashtags && (
              <div>
                <p className="text-xs uppercase tracking-wider text-muted">Hashtags</p>
                <p className="select-text break-words text-sm text-info">{post.hashtags}</p>
              </div>
            )}
            <p className="font-mono text-xs text-muted">
              {total} characters
              {limit ? ` · readers see the first ${limit} before “more”` : ''}
            </p>
            {post.platform === 'x' && total > 280 && (
              <p role="alert" className="text-sm text-danger">
                Over X’s 280 characters
              </p>
            )}
            <Button variant="outline" size="sm" onClick={copy}>
              {copied ? (
                <Check aria-hidden className="h-4 w-4" />
              ) : (
                <Copy aria-hidden className="h-4 w-4" />
              )}
              {copied ? 'Copied' : 'Copy caption and hashtags'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
