import { NavLink, Navigate, useParams } from 'react-router-dom';
import { useAuth } from '@/app/auth';
import { PageHeader } from '@/components/page-header';
import { GeneralSettings } from '@/features/settings/components/general-settings';
import { Integrations } from '@/features/settings/components/integrations';
import { Platforms } from '@/features/settings/components/platforms';
import { ScheduleTemplates } from '@/features/settings/components/schedule-templates';
import { ScoringSettings } from '@/features/settings/components/scoring-settings';
import { SeedKeywords } from '@/features/settings/components/seed-keywords';
import { cn } from '@/lib/utils';

const TABS = [
  { slug: 'general', label: 'General', admin: true },
  { slug: 'scoring', label: 'Scoring' },
  { slug: 'seed-keywords', label: 'Seed keywords' },
  { slug: 'schedule-templates', label: 'Schedule templates', admin: true },
  { slug: 'platforms', label: 'Platforms', admin: true },
  { slug: 'integrations', label: 'Integrations', admin: true },
] as const;

export default function SettingsPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const tabs = TABS.filter((t) => isAdmin || !('admin' in t));
  const tab = useParams()['*'] || '';
  const current = tabs.find((t) => t.slug === tab);
  if (!current) return <Navigate to="/settings/scoring" replace />;

  return (
    <>
      <PageHeader title="Settings" />
      <nav aria-label="Settings sections" className="mt-4 overflow-x-auto border-b border-line">
        <ul className="flex gap-1">
          {tabs.map((t) => (
            <li key={t.slug}>
              <NavLink
                to={`/settings/${t.slug}`}
                className={({ isActive }) =>
                  cn(
                    'flex min-h-touch items-center whitespace-nowrap border-b-2 border-transparent px-3 text-sm text-muted hover:text-ink',
                    isActive && 'border-accent font-medium text-ink',
                  )
                }
              >
                {t.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="mt-6">
        {current.slug === 'general' && <GeneralSettings />}
        {current.slug === 'scoring' && <ScoringSettings />}
        {current.slug === 'seed-keywords' && <SeedKeywords />}
        {current.slug === 'schedule-templates' && <ScheduleTemplates />}
        {current.slug === 'platforms' && <Platforms />}
        {current.slug === 'integrations' && <Integrations />}
      </div>
    </>
  );
}
