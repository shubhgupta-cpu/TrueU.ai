import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api';
import { PLATFORM_LABEL } from '@/lib/preview';
import type { TemplateSlot } from '@/types/api';

type Template = { name: string; day1_weekday: number; slots: TemplateSlot[] };

const ROLES: Array<[string, string]> = [
  ['long_video', 'Long video'],
  ['short_1', 'Short 1'],
  ['short_2', 'Short 2'],
  ['short_3', 'Short 3'],
];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function Row({ s, day1Weekday }: { s: TemplateSlot; day1Weekday: number }) {
  const qc = useQueryClient();
  const [time, setTime] = useState(s.local_time);
  const save = useMutation({
    mutationFn: (change: { local_time?: string; day?: number; asset_role?: string }) =>
      api(`/admin/schedule-slots/${s.id}`, { method: 'PATCH', body: change }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schedule-template'] }),
  });
  const weekday = WEEKDAYS[(day1Weekday + s.day - 1) % 7];
  const field = 'min-h-touch rounded-md border border-line bg-surface px-2';
  return (
    <tr className="border-t border-line">
      <td className="p-2">
        <label className="sr-only" htmlFor={`day-${s.id}`}>
          Day for {s.platform}
        </label>
        <select
          id={`day-${s.id}`}
          value={s.day}
          onChange={(e) => save.mutate({ day: Number(e.target.value) })}
          className={field}
        >
          {Array.from({ length: 15 }, (_, i) => i + 1).map((d) => (
            <option key={d} value={d}>
              Day {d}
            </option>
          ))}
        </select>
      </td>
      <td className="p-2 font-mono text-xs">{weekday}</td>
      <td className="p-2 font-medium">{PLATFORM_LABEL[s.platform] ?? s.platform}</td>
      <td className="p-2">
        {s.asset_role ? (
          <>
            <label className="sr-only" htmlFor={`role-${s.id}`}>
              Video for {s.platform} on day {s.day}
            </label>
            <select
              id={`role-${s.id}`}
              value={s.asset_role}
              onChange={(e) => save.mutate({ asset_role: e.target.value })}
              className={field}
            >
              {ROLES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </>
        ) : (
          <span className="text-muted">Whole project</span>
        )}
      </td>
      <td className="p-2">
        <label className="sr-only" htmlFor={`time-${s.id}`}>
          Time for {s.platform} on day {s.day}
        </label>
        <input
          id={`time-${s.id}`}
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          onBlur={() => time && time !== s.local_time && save.mutate({ local_time: time })}
          className={`${field} font-mono`}
        />
      </td>
      <td className="p-2 text-xs text-danger">{save.isError ? save.error.message : ''}</td>
    </tr>
  );
}

/** The default 15-day plan. A change applies to schedules built afterwards, never to ones already built. */
export function ScheduleTemplates() {
  const q = useQuery({
    queryKey: ['schedule-template'],
    queryFn: () => api<Template>('/admin/schedule-slots'),
  });
  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm text-muted">
        The standard plan: which video goes on which platform, on which day and at what time
        (Eastern). Change a day, video or time here and every schedule you build{' '}
        <strong>from now on</strong> uses it. Schedules already built keep their times: rebuild one
        from its project to apply the change.
      </p>
      {q.isError && (
        <p role="alert" className="text-sm text-danger">
          {q.error.message}
        </p>
      )}
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="p-2">Day</th>
              <th className="p-2">Weekday</th>
              <th className="p-2">Platform</th>
              <th className="p-2">Video</th>
              <th className="p-2">Time (ET)</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {q.data?.slots.map((s) => <Row key={s.id} s={s} day1Weekday={q.data.day1_weekday} />)}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
