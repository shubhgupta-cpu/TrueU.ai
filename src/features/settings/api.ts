import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Json, SeedKeyword } from '@/types/api';

export type SettingsMap = Record<string, Json>;

const settingsKey = ['settings'] as const;
const keywordsKey = ['seed-keywords'] as const;

export function useSettings() {
  return useQuery({
    queryKey: settingsKey,
    queryFn: () => api<SettingsMap>('/settings'),
    staleTime: 60_000,
  });
}

/** Typed read with the documented default when the key is missing. */
export function setting<T>(map: SettingsMap | undefined, key: string, fallback: T): T {
  const v = map?.[key];
  return v === undefined || v === null ? fallback : (v as T);
}

/** Core settings the Inbox needs, with spec §8 defaults. */
export function useCoreSettings() {
  const q = useSettings();
  return {
    ...q,
    timezone: setting(q.data, 'timezone', 'UTC'),
    scoreThreshold: setting(q.data, 'score_threshold', 45),
    scoreMax: setting(q.data, 'score_max', 60),
    videosPerMonth: setting(q.data, 'videos_per_month', 4),
    categories: setting<string[]>(q.data, 'topic_categories', []),
  };
}

/** Admin only (the API returns 403 for other roles). */
export function useUpdateSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: Json }) =>
      api(`/settings/${encodeURIComponent(key)}`, { method: 'PATCH', body: { value } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKey }),
  });
}

export function useSeedKeywords() {
  return useQuery({ queryKey: keywordsKey, queryFn: () => api<SeedKeyword[]>('/seed-keywords') });
}

export function useSeedKeywordMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: keywordsKey });
  return {
    add: useMutation({
      mutationFn: (keyword: string) => api('/seed-keywords', { body: { keyword: keyword.trim() } }),
      onSuccess: invalidate,
    }),
    toggle: useMutation({
      mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
        api(`/seed-keywords/${id}`, { method: 'PATCH', body: { is_active } }),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api(`/seed-keywords/${id}`, { method: 'DELETE' }),
      onSuccess: invalidate,
    }),
  };
}
