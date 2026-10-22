import {
  CalendarDays,
  Cog,
  FileText,
  Gauge,
  Inbox,
  KanbanSquare,
  LogOut,
  type LucideIcon,
  Users,
} from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '@/app/auth';
import type { AppRole } from '@/lib/status';
import { cn } from '@/lib/utils';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  roles?: readonly AppRole[];
}

const mainNav: NavItem[] = [
  { to: '/inbox', label: 'Topic Inbox', icon: Inbox },
  { to: '/pipeline', label: 'Pipeline', icon: KanbanSquare },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
];

const adminNav: NavItem[] = [
  { to: '/settings', label: 'Settings', icon: Cog },
  { to: '/prompts', label: 'Prompts', icon: FileText, roles: ['admin'] },
  { to: '/admin/users', label: 'Users', icon: Users, roles: ['admin'] },
  { to: '/admin/usage', label: 'Usage', icon: Gauge, roles: ['admin'] },
];

function NavGroup({ label, items, role }: { label: string; items: NavItem[]; role: AppRole }) {
  const visible = items.filter((i) => !i.roles || i.roles.includes(role));
  if (visible.length === 0) return null;
  return (
    <div className="mt-6">
      <p className="px-3 pb-2 font-mono text-[11px] uppercase tracking-wider text-white/50">
        {label}
      </p>
      <ul className="space-y-1">
        {visible.map(({ to, label: text, icon: Icon }) => (
          <li key={to}>
            <NavLink
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex min-h-touch items-center gap-3 rounded-md px-3 text-sm text-white/80 hover:bg-white/10 hover:text-white',
                  isActive && 'bg-white/10 font-medium text-white',
                )
              }
            >
              <Icon aria-hidden className="h-4 w-4" />
              {text}
            </NavLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AppLayout() {
  const { profile, signOut } = useAuth();
  const role = profile?.role ?? 'editor';

  return (
    <div className="flex h-full">
      <nav
        aria-label="Main"
        className="fixed inset-y-0 left-0 flex w-sidebar flex-col bg-ink px-3 py-6 text-white"
      >
        <div className="px-3">
          <p className="font-heading text-lg font-bold">
            TrueU<span className="text-[#A5B4FC]">.ai</span>
          </p>
          <p className="text-xs text-white/60">Content Cockpit</p>
        </div>
        <NavGroup label="Content" items={mainNav} role={role} />
        <NavGroup label="Admin" items={adminNav} role={role} />
        <div className="mt-auto border-t border-white/10 px-3 pt-4">
          <p className="truncate text-sm">{profile?.full_name ?? profile?.email}</p>
          <p className="font-mono text-xs text-white/60">{role}</p>
          <button
            type="button"
            onClick={signOut}
            className="mt-2 flex min-h-touch items-center gap-2 text-sm text-white/80 hover:text-white"
          >
            <LogOut aria-hidden className="h-4 w-4" /> Sign out
          </button>
        </div>
      </nav>
      <main className="ml-sidebar min-h-full flex-1 px-10 py-8">
        <Outlet />
      </main>
    </div>
  );
}
