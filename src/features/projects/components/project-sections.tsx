import {
  BarChart3,
  Captions,
  Eye,
  FileText,
  Megaphone,
  Newspaper,
  ScrollText,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { BlogPanel } from '@/features/projects/components/blog-panel';
import { CaptionsPanel } from '@/features/projects/components/captions-panel';
import { CtasPanel, PollsPanel } from '@/features/projects/components/extras-panels';
import { PreviewsPanel } from '@/features/projects/components/previews-panel';
import { ScriptPanel } from '@/features/projects/components/script-panel';
import { YouTubePanel } from '@/features/projects/components/youtube-panel';
import { cn } from '@/lib/utils';
import type { ProjectDetail } from '@/types/api';

const SECTIONS: ReadonlyArray<readonly [string, string, LucideIcon]> = [
  ['script', 'Script', ScrollText],
  ['blog', 'Blog', Newspaper],
  ['captions', 'Captions', Captions],
  ['youtube', 'YouTube', FileText],
  ['ctas', 'CTAs & hooks', Megaphone],
  ['polls', 'Polls', BarChart3],
  ['previews', 'Previews', Eye],
];

/** One panel under a tab. When its tab was just clicked, a glow overlay plays once (keyed so it replays). */
function Section({
  id,
  flash,
  children,
}: {
  id: string;
  flash: { id: string; n: number } | null;
  children: React.ReactNode;
}) {
  return (
    <div id={`section-${id}`} className="relative scroll-mt-24">
      {children}
      {flash?.id === id && (
        <span
          key={flash.n}
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-lg motion-safe:animate-section-flash"
        />
      )}
    </div>
  );
}

/** Every generated panel of a project, under a sticky tab bar that scrolls to each one. */
export function ProjectSections({
  project: p,
  timeZone,
}: {
  project: ProjectDetail;
  timeZone: string;
}) {
  const [active, setActive] = useState<string>('script');
  const [flash, setFlash] = useState<{ id: string; n: number } | null>(null);

  useEffect(() => {
    // The section nearest the top of the screen is the active tab.
    const seen = new Map<string, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries)
          seen.set(
            e.target.id.replace('section-', ''),
            e.isIntersecting ? e.boundingClientRect.top : Infinity,
          );
        const top = [...seen]
          .filter(([, y]) => y !== Infinity)
          .sort((a, b) => Math.abs(a[1]) - Math.abs(b[1]))[0];
        if (top) setActive(top[0]);
      },
      { rootMargin: '-80px 0px -55% 0px' },
    );
    for (const [id] of SECTIONS) {
      const el = document.getElementById(`section-${id}`);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    // Arriving from a Pipeline card (#section-youtube): scroll to that panel once it has rendered.
    const id = window.location.hash.replace('#section-', '');
    if (!window.location.hash.startsWith('#section-')) return;
    const t = setTimeout(() => {
      document.getElementById(`section-${id}`)?.scrollIntoView({ block: 'start' });
      setFlash((f) => ({ id, n: (f?.n ?? 0) + 1 }));
    }, 300);
    return () => clearTimeout(t);
  }, []);

  const go = (id: string) => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document
      .getElementById(`section-${id}`)
      ?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    setActive(id);
    setFlash((f) => ({ id, n: (f?.n ?? 0) + 1 }));
  };

  return (
    <div className="space-y-6">
      <nav
        aria-label="Sections"
        className="sticky top-2 z-10 flex h-14 items-center gap-1 overflow-x-auto rounded-xl border border-line bg-surface/95 px-2 shadow-sm backdrop-blur"
      >
        {SECTIONS.map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => go(id)}
            aria-current={active === id ? 'true' : undefined}
            className={cn(
              'flex min-h-touch items-center gap-2 whitespace-nowrap rounded-lg px-4 text-sm font-medium transition-colors',
              active === id
                ? 'bg-accent text-white shadow'
                : 'text-muted hover:bg-accent-soft hover:text-accent',
            )}
          >
            <Icon aria-hidden className="h-4 w-4" />
            {label}
          </button>
        ))}
      </nav>
      <Section id="script" flash={flash}>
        <ScriptPanel project={p} timeZone={timeZone} />
      </Section>
      <Section id="blog" flash={flash}>
        <BlogPanel project={p} timeZone={timeZone} />
      </Section>
      <Section id="captions" flash={flash}>
        <CaptionsPanel project={p} timeZone={timeZone} />
      </Section>
      <Section id="youtube" flash={flash}>
        <YouTubePanel project={p} timeZone={timeZone} />
      </Section>
      <Section id="ctas" flash={flash}>
        <CtasPanel project={p} timeZone={timeZone} />
      </Section>
      <Section id="polls" flash={flash}>
        <PollsPanel project={p} timeZone={timeZone} />
      </Section>
      <Section id="previews" flash={flash}>
        <PreviewsPanel projectId={p.id} />
      </Section>
    </div>
  );
}
