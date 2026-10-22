import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { setting, useSettings, useUpdateSetting } from '../api';
import { parseHashtags } from '../logic';

const ZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Asia/Kolkata',
  'UTC',
];

const input = 'min-h-touch w-full rounded-md border border-line bg-surface px-3';

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      <p className="text-xs text-muted">{hint}</p>
    </div>
  );
}

function Form({ initial }: { initial: Record<string, string> }) {
  const update = useUpdateSetting();
  const [v, setV] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const on = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setSaved(false);
    setV((s) => ({ ...s, [k]: e.target.value }));
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    for (const k of ['blog_url', 'social_content_url'] as const) {
      if (v[k] && !/^https:\/\//.test(v[k]!)) return setError('Links must start with https://');
    }
    try {
      for (const [k, raw] of Object.entries(v)) {
        if (raw === initial[k]) continue;
        await update.mutateAsync({
          key: k,
          value: k === 'weekly_hashtags' ? parseHashtags(raw) : raw.trim(),
        });
      }
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t save.');
    }
  };

  return (
    <form onSubmit={save} className="space-y-6">
      <Card className="space-y-5 p-6">
        <Field
          id="tz"
          label="Time zone"
          hint="Every schedule time and the calendar use this zone. The client’s calendar is Eastern."
        >
          <select id="tz" value={v.timezone} onChange={on('timezone')} className={input}>
            {[...new Set([v.timezone!, ...ZONES])].map((z) => (
              <option key={z}>{z}</option>
            ))}
          </select>
        </Field>
        <Field
          id="blog"
          label="Blog link"
          hint="Used in CTAs. {slug} becomes the approved blog’s slug."
        >
          <input
            id="blog"
            value={v.blog_url}
            onChange={on('blog_url')}
            className={`${input} font-mono text-sm`}
          />
        </Field>
        <Field
          id="social"
          label="Link in social posts"
          hint="Where social posts point. {slug} becomes the blog’s slug; keep the tracking part."
        >
          <input
            id="social"
            value={v.social_content_url}
            onChange={on('social_content_url')}
            className={`${input} font-mono text-sm`}
          />
        </Field>
        <Field
          id="lead"
          label="Lead magnet"
          hint="What the CTAs offer, for example a free guide and its link. Leave empty for none."
        >
          <input id="lead" value={v.lead_magnet} onChange={on('lead_magnet')} className={input} />
        </Field>
        <Field
          id="tags"
          label="This week’s hashtags"
          hint="Separated by spaces or commas. Used as the third hashtag of social posts. Empty = the script’s YouTube hashtags."
        >
          <input
            id="tags"
            value={v.weekly_hashtags}
            onChange={on('weekly_hashtags')}
            className={`${input} font-mono text-sm`}
          />
        </Field>
        <Field
          id="trend"
          label="Trend search for monthly topics"
          hint="The one Google Trends search used when Claude suggests the month’s topics (needs a SerpAPI key)."
        >
          <input
            id="trend"
            value={v.monthly_trend_query}
            onChange={on('monthly_trend_query')}
            className={input}
          />
        </Field>
      </Card>
      <div className="flex items-center gap-4">
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? 'Saving…' : 'Save settings'}
        </Button>
        {saved && (
          <p role="status" className="text-sm text-success">
            Saved. New schedules, captions and topics use these values.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}

export function GeneralSettings() {
  const { data, isLoading } = useSettings();
  if (isLoading || !data) return <p className="text-sm text-muted">Loading…</p>;
  const hashtags = setting<string[]>(data, 'weekly_hashtags', []);
  return (
    <Form
      initial={{
        timezone: setting(data, 'timezone', 'America/New_York'),
        blog_url: setting(data, 'blog_url', ''),
        social_content_url: setting(data, 'social_content_url', ''),
        lead_magnet: setting(data, 'lead_magnet', ''),
        weekly_hashtags: hashtags.join(' '),
        monthly_trend_query: setting(data, 'monthly_trend_query', ''),
      }}
    />
  );
}
