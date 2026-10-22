import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation, useRoutes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthState, type Profile } from '@/app/auth';

vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<typeof import('@/lib/api')>()),
  // Pages fetch data on render; the guards are what's under test.
  api: () => new Promise(() => {}),
}));

const { routes } = await import('@/app/router');

function profile(role: Profile['role']): Profile {
  return {
    id: 'u1',
    email: `${role}@example.com`,
    full_name: null,
    role,
  };
}

function AppRoutes() {
  return useRoutes(routes);
}

function LocationProbe() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}

const pathname = () => screen.getByTestId('location').textContent;

function renderAt(path: string, auth: Partial<AuthState>) {
  const value: AuthState = {
    loading: false,
    profile: null,
    signIn: async () => {},
    signOut: async () => {},
    ...auth,
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthContext.Provider value={value}>
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
          <LocationProbe />
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

describe('route guards', () => {
  it('sends signed-out users to /login', () => {
    renderAt('/inbox', {});
    expect(pathname()).toBe('/login');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('shows the shell to an owner', () => {
    renderAt('/inbox', { profile: profile('owner') });
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Topic Inbox' })).toBeInTheDocument();
    // Admin-only links are hidden from owners.
    expect(screen.queryByRole('link', { name: 'Prompts' })).not.toBeInTheDocument();
  });

  it('blocks editors from the staff shell', () => {
    renderAt('/inbox', { profile: profile('editor') });
    expect(pathname()).toBe('/no-access');
  });

  it('blocks owners from admin pages', () => {
    renderAt('/admin/users', { profile: profile('owner') });
    expect(pathname()).toBe('/no-access');
  });

  it('lets admins open admin pages', () => {
    renderAt('/admin/users', { profile: profile('admin') });
    expect(screen.getByRole('heading', { name: 'Users' })).toBeInTheDocument();
  });

  it('keeps /approve/:token public', () => {
    renderAt('/approve/abc', {});
    expect(screen.getByText('Approval')).toBeInTheDocument();
  });
});
