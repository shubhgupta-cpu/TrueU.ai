// Pure Inbox logic: filtering, sorting, stats and which actions a status allows (spec §4.1, F4).
import type { TopicSource, TopicStatus } from '@/lib/status';
import { monthKey } from '@/lib/time';

export interface TopicListItem {
  id: string;
  topic_number: number;
  title: string;
  category: string | null;
  source: TopicSource;
  status: TopicStatus;
  score_total: number | null;
  duplicate_of: string | null;
  regenerated_from: string | null;
  selected_for_month: string | null;
  created_at: string;
}

export interface TopicFilters {
  source: 'all' | TopicSource;
  status: 'all' | 'active' | TopicStatus;
  category: 'all' | string;
  month: 'all' | string; // 'YYYY-MM' of created_at
  search: string;
  sort: 'score' | 'date';
}

export const defaultFilters: TopicFilters = {
  source: 'all',
  status: 'active',
  category: 'all',
  month: 'all',
  search: '',
  sort: 'score',
};

/** "Active" hides decisions already made (rejected) so the pool stays readable. */
const INACTIVE: readonly TopicStatus[] = ['rejected'];

export function filterTopics<T extends TopicListItem>(
  items: T[],
  f: TopicFilters,
  timeZone: string,
): T[] {
  const q = f.search.trim().toLowerCase();
  const out = items.filter((t) => {
    if (f.source !== 'all' && t.source !== f.source) return false;
    if (f.status === 'active' && INACTIVE.includes(t.status)) return false;
    if (f.status !== 'all' && f.status !== 'active' && t.status !== f.status) return false;
    if (f.category !== 'all' && t.category !== f.category) return false;
    if (f.month !== 'all' && monthKey(t.created_at, timeZone) !== f.month) return false;
    if (q && !t.title.toLowerCase().includes(q)) return false;
    return true;
  });
  return out.sort((a, b) => {
    if (f.sort === 'score') {
      // Unscored topics sink to the bottom; ties go to the newest.
      const diff = (b.score_total ?? -1) - (a.score_total ?? -1);
      if (diff !== 0) return diff;
    }
    return b.created_at.localeCompare(a.created_at);
  });
}

export interface TopicStats {
  awaitingScore: number;
  qualified: number;
  needsWork: number;
  selectedThisMonth: number;
  monthlySlots: number;
}

export function topicStats(
  items: TopicListItem[],
  currentCycleMonth: string,
  monthlySlots: number,
): TopicStats {
  return {
    awaitingScore: items.filter((t) => t.status === 'new' || t.status === 'scoring').length,
    qualified: items.filter((t) => t.status === 'qualified').length,
    needsWork: items.filter((t) => t.status === 'needs_work').length,
    selectedThisMonth: items.filter(
      (t) => t.status === 'selected' && t.selected_for_month === currentCycleMonth,
    ).length,
    monthlySlots,
  };
}

/** F4.5: selecting past the monthly slots asks for confirmation but isn't blocked. */
export function exceedsMonthlySlots(stats: TopicStats): boolean {
  return stats.selectedThisMonth >= stats.monthlySlots;
}

export interface TopicActions {
  select: boolean;
  save: boolean;
  reject: boolean;
  rescore: boolean;
  edit: boolean;
}

/**
 * Spec §4.1: from qualified or needs_work the owner can select, save or reject. Saved topics return
 * to the pool, so they can be selected or rejected too. Rescore works once scoring isn't running.
 */
export function availableActions(status: TopicStatus): TopicActions {
  const decidable = status === 'qualified' || status === 'needs_work' || status === 'saved';
  const busy = status === 'new' || status === 'scoring';
  return {
    select: decidable,
    save: status === 'qualified' || status === 'needs_work',
    reject: decidable,
    rescore: !busy && status !== 'selected',
    edit: status !== 'selected',
  };
}

/**
 * "Regenerate from suggestions": offered for any scored topic below the pass mark (including
 * earlier rewrites), unless it's being scored, already selected, or a rewrite is running.
 */
export function canRegenerate(
  t: { status: TopicStatus; score_total: number | null; regenerating?: boolean },
  threshold: number,
): boolean {
  if (t.score_total === null || t.score_total >= threshold || t.regenerating) return false;
  return !['new', 'scoring', 'selected'].includes(t.status);
}

/** Distinct 'YYYY-MM' months with topics, newest first, for the month filter. */
export function monthOptions(items: TopicListItem[], timeZone: string): string[] {
  return [...new Set(items.map((t) => monthKey(t.created_at, timeZone)))].sort().reverse();
}
