import { useEffect, useState } from 'react';
import { BlogPanel } from '@/features/projects/components/blog-panel';
import { CaptionsPanel } from '@/features/projects/components/captions-panel';
import { CtasPanel, PollsPanel } from '@/features/projects/components/extras-panels';
import { PreviewsPanel } from '@/features/projects/components/previews-panel';
import { ScriptPanel } from '@/features/projects/components/script-panel';
import { YouTubePanel } from '@/features/projects/components/youtube-panel';
import { cn } from '@/lib/utils';
import type { ProjectDetail } from '@/types/api';

const SECTIONS = [
  ['script', 'Script'],
  ['blog', 'Blog'],
  ['captions', 'Captions'],
  ['youtube', 'YouTube'],
  ['ctas', 'CTAs & hooks'],
  ['polls', 'Polls'],
  ['previews', 'Previews'],
] as const;

/** Every generated panel of a project, under a sticky tab bar that scrolls to each one. */
export function ProjectSections({
  project: p,
  timeZone,
}: {
  project: ProjectDetail;
  timeZone: string;
}) {
  const [active, setActive] = useState<string>('script');

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

  const go = (id: string) => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document
      .getElementById(`section-${id}`)
      ?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    setActive(id);
  };

  return (
    <div className="space-y-6">
      <nav
        aria-label="Sections"
        className="sticky top-0 z-10 -mx-1 flex gap-2 overflow-x-auto bg-ground/95 px-1 py-2 backdrop-blur"
      >
        {SECTIONS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => go(id)}
            aria-current={active === id ? 'true' : undefined}
            className={cn(
              'min-h-touch whitespace-nowrap rounded-md border px-4 text-sm',
              active === id
                ? 'border-accent bg-accent-soft font-medium text-accent'
                : 'border-line bg-surface hover:bg-ground',
            )}
          >
            {label}
          </button>
        ))}
      </nav>
      <div id="section-script" className="scroll-mt-20">
        <ScriptPanel project={p} timeZone={timeZone} />
      </div>
      <div id="section-blog" className="scroll-mt-20">
        <BlogPanel project={p} timeZone={timeZone} />
      </div>
      <div id="section-captions" className="scroll-mt-20">
        <CaptionsPanel project={p} timeZone={timeZone} />
      </div>
      <div id="section-youtube" className="scroll-mt-20">
        <YouTubePanel project={p} timeZone={timeZone} />
      </div>
      <div id="section-ctas" className="scroll-mt-20">
        <CtasPanel project={p} timeZone={timeZone} />
      </div>
      <div id="section-polls" className="scroll-mt-20">
        <PollsPanel project={p} timeZone={timeZone} />
      </div>
      <div id="section-previews" className="scroll-mt-20">
        <PreviewsPanel projectId={p.id} />
      </div>
    </div>
  );
}
