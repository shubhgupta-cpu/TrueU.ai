import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { topicSource, topicStatus } from '@/lib/status';
import { formatMonth } from '@/lib/time';
import type { TopicFilters } from '../logic';

export function TopicFilterBar({
  filters,
  onChange,
  categories,
  months,
}: {
  filters: TopicFilters;
  onChange: (f: TopicFilters) => void;
  categories: string[];
  months: string[];
}) {
  const set = <K extends keyof TopicFilters>(key: K, value: TopicFilters[K]) =>
    onChange({ ...filters, [key]: value });

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <div className="col-span-2 space-y-1 md:col-span-3 xl:col-span-1">
        <Label htmlFor="topic-search">Search</Label>
        <Input
          id="topic-search"
          type="search"
          placeholder="Title contains…"
          value={filters.search}
          onChange={(e) => set('search', e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="f-source">Source</Label>
        <Select
          id="f-source"
          value={filters.source}
          onChange={(e) => set('source', e.target.value as TopicFilters['source'])}
        >
          <option value="all">All sources</option>
          {Object.entries(topicSource).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="f-status">Status</Label>
        <Select
          id="f-status"
          value={filters.status}
          onChange={(e) => set('status', e.target.value as TopicFilters['status'])}
        >
          <option value="active">All except rejected</option>
          <option value="all">All statuses</option>
          {Object.entries(topicStatus).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="f-category">Category</Label>
        <Select
          id="f-category"
          value={filters.category}
          onChange={(e) => set('category', e.target.value)}
        >
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="f-month">Month added</Label>
        <Select id="f-month" value={filters.month} onChange={(e) => set('month', e.target.value)}>
          <option value="all">Any month</option>
          {months.map((m) => (
            <option key={m} value={m}>
              {formatMonth(m)}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="f-sort">Sort by</Label>
        <Select
          id="f-sort"
          value={filters.sort}
          onChange={(e) => set('sort', e.target.value as TopicFilters['sort'])}
        >
          <option value="score">Score (highest first)</option>
          <option value="date">Date (newest first)</option>
        </Select>
      </div>
    </div>
  );
}
