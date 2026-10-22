import { describe, expect, it } from 'vitest';
import {
  availableActions,
  canRegenerate,
  defaultFilters,
  exceedsMonthlySlots,
  filterTopics,
  monthOptions,
  type TopicListItem,
  topicStats,
} from '@/features/topics/logic';
import { cycleMonth } from '@/lib/time';

let n = 0;
function topic(p: Partial<TopicListItem>): TopicListItem {
  n += 1;
  return {
    id: `t${n}`,
    topic_number: n,
    title: `Topic ${n}`,
    category: null,
    source: 'owner',
    status: 'qualified',
    score_total: null,
    duplicate_of: null,
    regenerated_from: null,
    selected_for_month: null,
    created_at: '2026-10-01T10:00:00Z',
    ...p,
  };
}

describe('filterTopics', () => {
  const items = [
    topic({
      title: 'Quit or stay',
      score_total: 40,
      status: 'needs_work',
      created_at: '2026-10-02T00:00:00Z',
    }),
    topic({
      title: 'AI at work',
      score_total: 52,
      source: 'trending',
      created_at: '2026-09-15T00:00:00Z',
    }),
    topic({ title: 'Unscored', status: 'new', created_at: '2026-10-05T00:00:00Z' }),
    topic({ title: 'Dropped', score_total: 58, status: 'rejected', category: 'Values' }),
  ];

  it('defaults to score order, unscored last, rejected hidden', () => {
    expect(filterTopics(items, defaultFilters, 'UTC').map((t) => t.title)).toEqual([
      'AI at work',
      'Quit or stay',
      'Unscored',
    ]);
  });

  it('sorts by date when asked', () => {
    const out = filterTopics(items, { ...defaultFilters, sort: 'date' }, 'UTC');
    expect(out.map((t) => t.title)).toEqual(['Unscored', 'Quit or stay', 'AI at work']);
  });

  it('filters by source, status, category, month and title search', () => {
    expect(filterTopics(items, { ...defaultFilters, source: 'trending' }, 'UTC')).toHaveLength(1);
    expect(filterTopics(items, { ...defaultFilters, status: 'rejected' }, 'UTC')).toHaveLength(1);
    expect(
      filterTopics(items, { ...defaultFilters, status: 'all', category: 'Values' }, 'UTC'),
    ).toHaveLength(1);
    expect(
      filterTopics(items, { ...defaultFilters, month: '2026-09' }, 'UTC').map((t) => t.title),
    ).toEqual(['AI at work']);
    expect(filterTopics(items, { ...defaultFilters, search: 'QUIT' }, 'UTC')).toHaveLength(1);
  });

  it('assigns months in the settings time zone', () => {
    const late = [topic({ created_at: '2026-09-30T20:00:00Z' })];
    expect(
      filterTopics(late, { ...defaultFilters, month: '2026-10' }, 'Asia/Kolkata'),
    ).toHaveLength(1);
    expect(filterTopics(late, { ...defaultFilters, month: '2026-10' }, 'UTC')).toHaveLength(0);
    expect(monthOptions(late, 'Asia/Kolkata')).toEqual(['2026-10']);
  });
});

describe('topicStats', () => {
  it('counts statuses and this month’s selections', () => {
    const items = [
      topic({ status: 'new' }),
      topic({ status: 'scoring' }),
      topic({ status: 'qualified' }),
      topic({ status: 'needs_work' }),
      topic({ status: 'selected', selected_for_month: '2026-10-01' }),
      topic({ status: 'selected', selected_for_month: '2026-09-01' }),
    ];
    const stats = topicStats(items, '2026-10-01', 4);
    expect(stats).toEqual({
      awaitingScore: 2,
      qualified: 1,
      needsWork: 1,
      selectedThisMonth: 1,
      monthlySlots: 4,
    });
    expect(exceedsMonthlySlots(stats)).toBe(false);
    expect(exceedsMonthlySlots({ ...stats, selectedThisMonth: 4 })).toBe(true);
  });

  it('cycle month follows the settings time zone', () => {
    expect(cycleMonth(new Date('2026-10-31T20:00:00Z'), 'Asia/Kolkata')).toBe('2026-11-01');
    expect(cycleMonth(new Date('2026-10-31T20:00:00Z'), 'UTC')).toBe('2026-10-01');
  });
});

describe('availableActions (spec §4.1)', () => {
  it('qualified and needs_work can be selected, saved or rejected', () => {
    for (const s of ['qualified', 'needs_work'] as const) {
      expect(availableActions(s)).toMatchObject({
        select: true,
        save: true,
        reject: true,
        rescore: true,
      });
    }
  });

  it('saved topics return to the pool: select or reject, not save again', () => {
    expect(availableActions('saved')).toMatchObject({ select: true, save: false, reject: true });
  });

  it('nothing can be decided while scoring', () => {
    for (const s of ['new', 'scoring'] as const) {
      expect(availableActions(s)).toEqual({
        select: false,
        save: false,
        reject: false,
        rescore: false,
        edit: true,
      });
    }
  });

  it('selected topics are locked', () => {
    expect(availableActions('selected')).toEqual({
      select: false,
      save: false,
      reject: false,
      rescore: false,
      edit: false,
    });
  });

  it('errored topics can be rescored', () => {
    expect(availableActions('error').rescore).toBe(true);
  });
});

describe('canRegenerate', () => {
  const t = (
    status: TopicListItem['status'],
    score_total: number | null,
    regenerating = false,
  ) => ({
    status,
    score_total,
    regenerating,
  });
  it('is offered for scored topics below the pass mark, including rewrites and saved ones', () => {
    expect(canRegenerate(t('needs_work', 38), 45)).toBe(true);
    expect(canRegenerate(t('saved', 44), 45)).toBe(true);
    expect(canRegenerate(t('rejected', 30), 45)).toBe(true);
  });
  it('is hidden at or above the pass mark, while busy, once selected or unscored', () => {
    expect(canRegenerate(t('qualified', 45), 45)).toBe(false);
    expect(canRegenerate(t('needs_work', 40, true), 45)).toBe(false);
    expect(canRegenerate(t('scoring', 40), 45)).toBe(false);
    expect(canRegenerate(t('selected', 40), 45)).toBe(false);
    expect(canRegenerate(t('new', null), 45)).toBe(false);
  });
});
