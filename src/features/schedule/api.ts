import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, POLL_IDLE_MS } from '@/lib/api';
import type { ScheduleView } from '@/types/api';

export function useSchedule(projectId?: string) {
  return useQuery({
    queryKey: ['schedule', projectId ?? 'all'],
    queryFn: () => api<ScheduleView>(projectId ? `/projects/${projectId}/schedule` : '/schedule'),
    refetchInterval: POLL_IDLE_MS,
  });
}

export function useBuildSchedule(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { day1: string; weeks: 2 | 3 | 4 }) =>
      api(`/projects/${projectId}/schedule`, { method: 'POST', body: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schedule'] }),
  });
}

export function useSetPostTime() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; local: string }) =>
      api(`/scheduled-posts/${v.id}`, { method: 'PATCH', body: { local: v.local } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schedule'] }),
  });
}
