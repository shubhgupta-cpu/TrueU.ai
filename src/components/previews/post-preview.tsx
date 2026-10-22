import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { layoutOf, PLATFORM_LABEL, visibleText } from '@/lib/preview';
import { cn } from '@/lib/utils';
import type { PostPreview } from '@/types/api';

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

function Caption({ platform, text, tags }: { platform: string; text: string; tags: string }) {
  const { shown, folded } = visibleText(platform, text);
  return (
    <p className="whitespace-pre-line text-sm">
      {shown}
      {folded && <span className="text-muted"> more</span>}
      {tags && <span className="mt-1 block text-info">{tags}</span>}
    </p>
  );
}

const Handle = () => (
  <div className="flex items-center gap-2">
    <span
      aria-hidden
      className="grid h-8 w-8 place-items-center rounded-full bg-accent text-xs font-semibold text-white"
    >
      T
    </span>
    <span className="text-sm font-semibold">TrueU.ai</span>
  </div>
);

/** An approximation of how the platform shows the post: layout, video shape and where the text folds. */
export function PostPreviewCard({ post }: { post: PostPreview }) {
  const layout = layoutOf(post.platform);
  const body = { platform: post.platform, text: post.caption, tags: post.hashtags };
  return (
    <figure className="w-full max-w-[300px] overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
      <figcaption className="flex items-center justify-between border-b border-line px-3 py-2 text-xs">
        <span className="font-medium">{PLATFORM_LABEL[post.platform] ?? post.platform}</span>
        <span className="text-muted">
          {post.status === 'approved' ? 'Approved' : `Not approved (${post.status})`}
        </span>
      </figcaption>
      {layout === 'vertical' && (
        <div className="relative">
          <Video id={post.video_id} className="aspect-[9/16] w-full" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 space-y-1 bg-gradient-to-t from-black/80 to-transparent p-3 pt-10 text-white">
            <span className="text-sm font-semibold">@trueu.ai</span>
            <p className="line-clamp-3 text-xs">{visibleText(post.platform, post.caption).shown}</p>
            {post.hashtags && <p className="line-clamp-1 text-xs opacity-80">{post.hashtags}</p>}
          </div>
        </div>
      )}
      {layout === 'feed' && (
        <div className="space-y-2 p-3">
          <Handle />
          {post.platform !== 'instagram_feed' && <Caption {...body} />}
          <Video
            id={post.video_id}
            className={cn(
              'w-full',
              post.platform === 'instagram_feed' ? 'aspect-[4/5]' : 'aspect-[9/16] max-h-[420px]',
            )}
          />
          {post.platform === 'instagram_feed' && <Caption {...body} />}
        </div>
      )}
      {layout === 'text' && (
        <div className="space-y-2 p-3">
          <Handle />
          <Caption {...body} />
          <Video id={post.video_id} className="aspect-video w-full rounded-lg" />
          {post.platform === 'x' && post.caption.length + post.hashtags.length + 1 > 280 && (
            <p className="text-xs text-danger">Over X's 280 characters</p>
          )}
        </div>
      )}
      {layout === 'pin' && (
        <div className="space-y-2 p-3">
          <Video id={post.video_id} className="aspect-[2/3] w-full rounded-lg" />
          {post.title && <p className="text-sm font-semibold">{post.title}</p>}
          <Caption {...body} />
        </div>
      )}
      {layout === 'youtube' && (
        <div className="space-y-2 p-3">
          <Video id={post.video_id} className="aspect-video w-full rounded-lg" />
          {post.title && <p className="text-sm font-semibold">{post.title}</p>}
          <Caption {...body} />
        </div>
      )}
    </figure>
  );
}
