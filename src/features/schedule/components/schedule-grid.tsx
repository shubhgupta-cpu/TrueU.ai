import { formatInTimeZone } from 'date-fns-tz';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PostTimes } from '@/features/schedule/components/post-times';
import { useSetPostTime } from '@/features/schedule/api';
import { cn } from '@/lib/utils';
import type { ScheduledPost } from '@/types/api';

const ROWS: Array<[string, string]> = [
  ['youtube', 'YouTube'],
  ['youtube_shorts', 'YouTube Shorts'],
  ['instagram_reels', 'Instagram Reels'],
  ['instagram_feed', 'Instagram Feed'],
  ['facebook', 'Facebook'],
  ['tiktok', 'TikTok'],
  ['threads', 'Threads'],
  ['x', 'X (Twitter)'],
  ['pinterest', 'Pinterest'],
  ['linkedin', 'LinkedIn'],
  ['blog', 'Blog'],
  ['newsletter', 'Newsletter'],
];

/** Label + colour per asset; the legend and tooltip keep colour from being the only signal. */
const ASSET: Record<string, { label: string; cls: string }> = {
  long_video: { label: 'Long-form video', cls: 'bg-ink text-white' },
  short_1: { label: 'Short #1', cls: 'bg-[#6BB8C4] text-ink' },
  short_2: { label: 'Short #2', cls: 'bg-[#B9A7DD] text-ink' },
  short_3: { label: 'Short #3', cls: 'bg-[#E3A092] text-ink' },
  blog: { label: 'Blog post', cls: 'bg-[#E3D2A4] text-ink' },
  newsletter: { label: 'Newsletter', cls: 'bg-[#9CC7B1] text-ink' },
};
const assetOf = (p: ScheduledPost) =>
  ASSET[p.asset_role ?? p.platform] ?? { label: 'Other', cls: 'bg-ground text-ink' };

const clock = (iso: string, tz: string) => {
  const d = new Date(iso);
  return formatInTimeZone(d, tz, formatInTimeZone(d, tz, 'mm') === '00' ? 'h a' : 'h:mm a');
};

const MARK: Partial<Record<ScheduledPost['publish_status'], string>> = {
  sent: ' ✓',
  scheduled: ' ✓',
  published: ' ✓✓',
  failed: ' ✕',
};

function PostEditor({
  post,
  timezone,
  onDone,
}: {
  post: ScheduledPost;
  timezone: string;
  onDone: () => void;
}) {
  const set = useSetPostTime();
  const [local, setLocal] = useState(post.local);
  const locked = !['planned', 'failed'].includes(post.publish_status);
  return (
    <div className="mt-4 flex flex-wrap items-end gap-4 rounded-lg border border-line bg-surface p-4">
      <div>
        <p className="font-medium">
          {assetOf(post).label} · {post.platform.replace(/_/g, ' ')} · Day {post.day}
        </p>
        <p className="text-sm text-muted">
          Status: {post.publish_status}
          {post.custom && ' · time set by hand'}
        </p>
        {post.blocked && <p className="text-sm text-warning">Waiting: {post.blocked}</p>}
        {post.last_error && !post.blocked && (
          <p className="text-sm text-danger">{post.last_error}</p>
        )}
      </div>
      <div>
        <label htmlFor="post-time" className="block text-sm font-medium">
          Post at ({timezone})
        </label>
        <Input
          id="post-time"
          type="datetime-local"
          value={local}
          disabled={locked}
          onChange={(e) => setLocal(e.target.value)}
        />
      </div>
      <Button
        disabled={locked || set.isPending || !local || local === post.local}
        onClick={() => set.mutate({ id: post.id, local }, { onSuccess: onDone })}
      >
        Save time
      </Button>
      <Button variant="ghost" onClick={onDone}>
        Close
      </Button>
      {set.isError && (
        <p role="alert" className="w-full text-sm text-danger">
          {set.error.message}
        </p>
      )}
    </div>
  );
}

export function ScheduleGrid({ posts, timezone }: { posts: ScheduledPost[]; timezone: string }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = posts.find((p) => p.id === openId);
  const days = Array.from({ length: 15 }, (_, i) => i + 1);
  const dateOf = (d: number) => {
    const p = posts.find((x) => x.day === d && !x.custom) ?? posts.find((x) => x.day === d);
    return p ? formatInTimeZone(new Date(p.scheduled_at), timezone, 'EEE d MMM') : '';
  };
  const rows = ROWS.filter(([key]) => posts.some((p) => p.platform === key));
  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-4 text-sm text-muted">
        {Object.values(ASSET).map((a) => (
          <li key={a.label} className="flex items-center gap-2">
            <span aria-hidden className={cn('h-3 w-3 rounded-sm', a.cls)} />
            {a.label}
          </li>
        ))}
        <li>Dashed = optional</li>
        <li>✓ sent · ✓✓ published · ✕ failed · ✎ time set by hand · click a time to change it</li>
      </ul>
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full min-w-[1100px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="w-36 p-2" />
              {days.map((d) => (
                <th key={d} className="border-l border-line p-2 text-center font-medium">
                  D{d}
                  <span className="block font-mono text-[11px] font-normal text-muted">
                    {dateOf(d)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([key, label]) => (
              <tr key={key} className="border-t border-line">
                <th scope="row" className="p-2 text-left font-medium">
                  {label}
                </th>
                {days.map((d) => (
                  <td key={d} className="border-l border-line p-1 align-top">
                    <div className="flex flex-col gap-1">
                      {posts
                        .filter((p) => p.platform === key && p.day === d)
                        .map((p) => (
                          <button
                            type="button"
                            key={p.id}
                            onClick={() => setOpenId(p.id === openId ? null : p.id)}
                            aria-label={`${assetOf(p).label}, ${p.platform.replace(/_/g, ' ')}, day ${p.day}, ${clock(p.scheduled_at, timezone)}, ${p.publish_status}. Edit time`}
                            title={`${assetOf(p).label} · ${p.publish_status}${p.blocked ? ` · waiting: ${p.blocked}` : ''}`}
                            className={cn(
                              'min-h-[32px] rounded-md px-2 py-1 text-center font-mono text-xs',
                              assetOf(p).cls,
                              p.optional && 'border border-dashed border-ink/50 bg-transparent',
                              p.id === openId && 'ring-2 ring-accent',
                              p.publish_status === 'failed' && 'ring-2 ring-danger',
                            )}
                          >
                            {clock(p.scheduled_at, timezone)}
                            {MARK[p.publish_status] ?? (p.custom ? ' ✎' : '')}
                          </button>
                        ))}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open && (
        <PostEditor key={open.id} post={open} timezone={timezone} onDone={() => setOpenId(null)} />
      )}
      <p className="mt-2 text-xs text-muted">
        All times in {timezone}. Nothing is sent to Metricool until the post is approved.
      </p>
      <PostTimes posts={posts} timezone={timezone} />
    </div>
  );
}
