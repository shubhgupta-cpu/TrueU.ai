import { NavLink, Navigate, useParams } from 'react-router-dom';
import { ComingInPhase, PageHeader } from '@/components/page-header';
import { ScoringSettings } from '@/features/settings/components/scoring-settings';
import { SeedKeywords } from '@/features/settings/components/seed-keywords';
import { cn } from '@/lib/utils';

const TABS = [
  { slug: 'general', label: 'General', phase: 6 },
  { slug: 'team', label: 'Team', phase: 2 },
  { slug: 'scoring', label: 'Scoring' },
  { slug: 'platforms', label: 'Platforms', phase: 4 },
  { slug: 'schedule-templates', label: 'Schedule templates', phase: 5 },
  { slug: 'graphics-templates', label: 'Graphics templates', phase: 4 },
  { slug: 'seed-keywords', label: 'Seed keywords' },
  { slug: 'integrations', label: 'Integrations', phase: 6 },
] as const;

export default function SettingsPage() {
  const tab = useParams()['*'] || '';
  const current = TABS.find((t) => t.slug === tab);
  if (!current) return <Navigate to="/settings/scoring" replace />;

  return (
    <>
      <PageHeader title="Settings" />
      <nav aria-label="Settings sections" className="mt-4 overflow-x-auto border-b border-line">
        <ul className="flex gap-1">
          {TABS.map((t) => (
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
        {current.slug === 'scoring' && <ScoringSettings />}
        {current.slug === 'seed-keywords' && <SeedKeywords />}
        {'phase' in current && <ComingInPhase phase={current.phase} />}
      </div>
    </>
  );
}
