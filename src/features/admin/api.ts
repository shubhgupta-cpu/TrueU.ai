import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, POLL_IDLE_MS } from '@/lib/api';
import type { AdminUser, UsageSummary } from '@/types/api';

const usersKey = ['admin-users'] as const;

export function useAdminUsers() {
  return useQuery({
    queryKey: usersKey,
    queryFn: () => api<AdminUser[]>('/admin/users'),
    refetchInterval: POLL_IDLE_MS,
  });
}

function useUserAction<V, R = unknown>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: usersKey }),
  });
}

export const useCreateUser = () =>
  useUserAction((v: { email: string; role: AdminUser['role']; full_name?: string }) =>
    api<{ user: AdminUser; password: string }>('/admin/users', { body: v }),
  );

export const useChangeRole = () =>
  useUserAction((v: { id: string; role: AdminUser['role'] }) =>
    api(`/admin/users/${v.id}`, { method: 'PATCH', body: { role: v.role } }),
  );

export const useRemoveAccess = () =>
  useUserAction((id: string) => api(`/admin/users/${id}/revoke`, { method: 'POST' }));

export const useResetPassword = () =>
  useUserAction((id: string) =>
    api<{ password: string }>(`/admin/users/${id}/reset-password`, { method: 'POST' }),
  );

export function useUsage() {
  return useQuery({
    queryKey: ['admin-usage'],
    queryFn: () => api<UsageSummary>('/admin/usage'),
    staleTime: 60_000,
  });
}
