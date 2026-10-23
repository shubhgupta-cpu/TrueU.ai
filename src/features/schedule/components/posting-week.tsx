import { formatInTimeZone } from 'date-fns-tz';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { useBuildSchedule, useSchedule } from '@/features/schedule/api';
import { addDays, weekdayOf } from '@/lib/schedule';

const fmt = (d: string) => formatInTimeZone(new Date(`${d}T12:00:00Z`), 'UTC', 'd MMM');

/** The next `count` Tuesdays at least a week out (settings.min_lead_days). */
function tuesdays(count: number): string[] {
  let d = addDays(new Date().toISOString().slice(0, 10), 7);
  while (weekdayOf(d) !== 2) d = addDays(d, 1);
  return Array.from({ length: count }, (_, i) => addDays(d, i * 7));
}

/** Picks the week a project starts posting (Day 1 = that Tuesday) and builds its schedule. */
export function PostingWeek({ projectId }: { projectId: string }) {
  const { data } = useSchedule();
  const build = useBuildSchedule(projectId);
  const tz = data?.timezone ?? 'America/New_York';
  const day1Of = new Map<string, string>(); // project id → its Day 1 date
  const titleOf = new Map<string, string>();
  for (const p of data?.posts ?? []) {
    if (p.day !== 1 || !p.project_id) continue;
    day1Of.set(p.project_id, formatInTimeZone(new Date(p.scheduled_at), tz, 'yyyy-MM-dd'));
    titleOf.set(p.project_id, p.project_title);
  }
  const current = day1Of.get(projectId);
  const weeks = tuesdays(12);
  if (current && !weeks.includes(current)) weeks.unshift(current);
  /** Another project whose 15-day cycle overlaps a cycle starting on `d`. */
  const overlap = (d: string) =>
    [...day1Of].find(
      ([id, other]) =>
        id !== projectId && Math.abs(Date.parse(d) - Date.parse(other)) < 14 * 86_400_000,
    );
  const [picked, setPicked] = useState<string | null>(null);
  const [weeksLong, setWeeksLong] = useState<2 | 3 | 4>(2);
  const week = picked ?? current ?? weeks.find((d) => !overlap(d)) ?? weeks[0]!;
  const clash = overlap(week);

  return (
    <div className="space-y-2">
      <label className="block text-sm font-semibold" htmlFor={`week-${projectId}`}>
        Posting week
      </label>
      <Select id={`week-${projectId}`} value={week} onChange={(e) => setPicked(e.target.value)}>
        {weeks.map((d) => {
          const o = overlap(d);
          return (
            <option key={d} value={d}>
              {`Tue ${fmt(d)} – Mon ${fmt(addDays(d, 13))}${o ? ` · overlaps ${titleOf.get(o[0])}` : ''}`}
            </option>
          );
        })}
      </Select>
      {clash && (
        <p role="alert" className="text-sm text-warning">
          Overlaps “{titleOf.get(clash[0])}”: posts on the same platform can land close together.
        </p>
      )}
      <label className="block pt-2 text-sm font-semibold" htmlFor={`weeks-${projectId}`}>
        Spread over
      </label>
      <Select
        id={`weeks-${projectId}`}
        value={weeksLong}
        onChange={(e) => setWeeksLong(Number(e.target.value) as 2 | 3 | 4)}
      >
        <option value={2}>2 weeks · standard plan</option>
        <option value={3}>3 weeks · Shorts 2 and 3 a week later</option>
        <option value={4}>4 weeks · Shorts 2 and 3 two weeks later</option>
      </Select>
      <Button
        className="w-full"
        disabled={build.isPending}
        onClick={() => build.mutate({ day1: week, weeks: weeksLong })}
      >
        {current
          ? week === current
            ? `Rebuild (scheduled from ${fmt(current)})`
            : 'Move to this week'
          : 'Schedule this week'}
      </Button>
      {build.isError && (
        <p role="alert" className="text-sm text-danger">
          {build.error.message}
        </p>
      )}
    </div>
  );
}
