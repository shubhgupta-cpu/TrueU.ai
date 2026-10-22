import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { api, setUnauthorizedHandler } from '@/lib/api';
import type { AppRole } from '@/lib/status';
import type { Profile } from '@/types/api';

export type { Profile };

export interface AuthState {
  loading: boolean;
  profile: Profile | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

const meKey = ['auth', 'me'] as const;

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: meKey,
    queryFn: () => api<{ profile: Profile | null }>('/auth/me'),
    staleTime: 5 * 60_000,
    retry: false,
  });

  useEffect(() => {
    // Any 401 (cookie expired, user removed in Airtable) → back to signed out.
    setUnauthorizedHandler(() =>
      qc.setQueryData<{ profile: Profile | null }>(meKey, { profile: null }),
    );
    return () => setUnauthorizedHandler(null);
  }, [qc]);

  const value: AuthState = {
    loading: me.isLoading,
    profile: me.data?.profile ?? null,
    signIn: async (email, password) => {
      await api('/auth/login', { body: { email, password } });
      await qc.invalidateQueries({ queryKey: meKey });
    },
    signOut: async () => {
      await api('/auth/logout', { method: 'POST' });
      qc.clear();
      qc.setQueryData<{ profile: Profile | null }>(meKey, { profile: null });
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function FullPageMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-10 text-sm text-muted" role="status">
      {children}
    </div>
  );
}

/** Route guard: requires a signed-in user. Others go to /login and come back after. */
export function RequireAuth() {
  const { loading, profile } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageMessage>Loading…</FullPageMessage>;
  if (!profile) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

/** Route guard: requires one of the given roles. The API checks again; this is UX. */
export function RequireRole({ roles }: { roles: readonly AppRole[] }) {
  const { loading, profile } = useAuth();
  if (loading) return <FullPageMessage>Loading…</FullPageMessage>;
  if (!profile || !roles.includes(profile.role)) return <Navigate to="/no-access" replace />;
  return <Outlet />;
}
