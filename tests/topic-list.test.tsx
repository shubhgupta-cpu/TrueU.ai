import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TopicList } from '@/features/topics/components/topic-list';
import type { Topic } from '@/features/topics/api';

const t = (n: number): Topic =>
  ({
    id: `t${n}`,
    topic_number: n,
    title: `Topic ${n}`,
    source: 'owner',
    status: 'qualified',
    score_total: 50,
    score_max: 60,
    regenerated_from: null,
    duplicate_of: null,
    regenerating: false,
  }) as unknown as Topic;

function setup(picked: string[] = []) {
  const fns = { onSelect: vi.fn(), onPick: vi.fn(), onPickAll: vi.fn(), onDelete: vi.fn() };
  render(
    <TopicList
      topics={[t(1), t(2)]}
      selectedId={null}
      scoreMax={60}
      picked={new Set(picked)}
      {...fns}
    />,
  );
  return fns;
}

describe('topic list selection', () => {
  it('ticks one topic without opening it', () => {
    const f = setup();
    fireEvent.click(screen.getByLabelText('Select topic 1: Topic 1'));
    expect(f.onPick).toHaveBeenCalledWith('t1');
    expect(f.onSelect).not.toHaveBeenCalled();
  });

  it('selects all shown and reflects what is ticked', () => {
    const f = setup(['t1']);
    const all = screen.getByLabelText(/Select all 2 shown/) as HTMLInputElement;
    expect(all.indeterminate).toBe(true);
    fireEvent.click(all);
    expect(f.onPickAll).toHaveBeenCalledWith(true);
  });

  it('deletes one topic from its row', () => {
    const f = setup();
    fireEvent.click(screen.getByLabelText('Delete topic 2'));
    expect(f.onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 't2' }));
  });
});
