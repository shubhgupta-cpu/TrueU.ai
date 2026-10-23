import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSetPostTime } from '@/features/schedule/api';
import type { ScheduledPost } from '@/types/api';

const GROUPS: Array<[string, string]> = [
  ['long_video', 'Long-form video'],
  ['short_1', 'Short #1'],
  ['short_2', 'Short #2'],
  ['short_3', 'Short #3'],
  ['blog', 'Blog post'],
  ['newsletter', 'Newsletter'],
];

const editable = (p: ScheduledPost) => ['planned', 'failed'].includes(p.publish_status);
const name = (p: string) => p.replace(/_/g, ' ');

function Row({ post }: { post: ScheduledPost }) {
  const set = useSetPostTime();
  const [local, setLocal] = useState(post.local);
  const id = `time-${post.id}`;
  return (
    <li className="flex flex-wrap items-center gap-3 py-2">
      <label htmlFor={id} className="w-40 text-sm capitalize">
        {name(post.platform)}
        <span className="block text-xs normal-case text-muted">
          Day {post.day} · {post.publish_status}
          {post.custom && ' · set by hand'}
        </span>
      </label>
      <Input
        id={id}
        type="datetime-local"
        className="w-56"
        value={local}
        disabled={!editable(post)}
        onChange={(e) => setLocal(e.target.value)}
      />
      <Button
        size="sm"
        variant="outline"
        disabled={!editable(post) || set.isPending || !local || local === post.local}
        onClick={() => set.mutate({ id: post.id, local })}
      >
        Save
      </Button>
      {post.blocked && <span className="text-xs text-warning">Waiting: {post.blocked}</span>}
      {set.isError && (
        <span role="alert" className="text-xs text-danger">
          {set.error.message}
        </span>
      )}
    </li>
  );
}

function Group({ label, posts }: { label: string; posts: ScheduledPost[] }) {
  const set = useSetPostTime();
  const [all, setAll] = useState('');
  const [error, setError] = useState<string | null>(null);
  const todo = posts.filter(editable);
  const apply = async () => {
    setError(null);
    const results = await Promise.allSettled(
      todo.map((p) => set.mutateAsync({ id: p.id, local: all })),
    );
    const failed = results.find((r) => r.status === 'rejected') as
      | PromiseRejectedResult
      | undefined;
    if (failed) setError(String(failed.reason?.message ?? failed.reason));
  };
  return (
    <section className="rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-end gap-3">
        <h4 className="mr-auto font-medium">{label}</h4>
        <div>
          <label htmlFor={`all-${label}`} className="block text-xs font-medium">
            Post everywhere at once
          </label>
          <Input
            id={`all-${label}`}
            type="datetime-local"
            className="w-56"
            value={all}
            onChange={(e) => setAll(e.target.value)}
          />
        </div>
        <Button disabled={!all || todo.length === 0 || set.isPending} onClick={apply}>
          Set {todo.length} post{todo.length === 1 ? '' : 's'}
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
      <ul className="mt-2 divide-y divide-line">
        {posts.map((p) => (
          <Row key={`${p.id}-${p.local}`} post={p} />
        ))}
      </ul>
    </section>
  );
}

/** Pick any date and time for a video's posts (e.g. a short that must go out tomorrow), one by one or all at once. */
export function PostTimes({ posts, timezone }: { posts: ScheduledPost[]; timezone: string }) {
  const fromLink = useLocation().hash === '#choose-dates';
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (fromLink) ref.current?.scrollIntoView({ block: 'start' });
  }, [fromLink]);
  return (
    <details
      ref={ref}
      id="choose-dates"
      open={fromLink || undefined}
      className="mt-4 scroll-mt-4 rounded-lg border border-line bg-ground p-4"
    >
      <summary className="min-h-touch cursor-pointer font-medium">
        Choose dates and times yourself
      </summary>
      <p className="my-3 text-sm text-muted">
        Pick a date and time ({timezone}) for any post, or for all of a video’s posts at once. It
        must be in the future, and a post still only goes out once its caption is approved.
      </p>
      <div className="space-y-3">
        {GROUPS.map(([role, label]) => {
          const mine = posts.filter((p) => (p.asset_role ?? p.platform) === role);
          return mine.length ? <Group key={role} label={label} posts={mine} /> : null;
        })}
      </div>
    </details>
  );
}
