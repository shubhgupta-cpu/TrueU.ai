import { cn } from '@/lib/utils';
import type { ProjectDetail } from '@/types/api';
import {
  CTA_GROUPS,
  CTA_TARGETS,
  type CtaGroup,
  fieldLabel,
} from '../../../../server/schemas/extras';
import { useRegenerateExtras, useUpdatePoll } from '../api';
import { ItemDecision, ItemStatusBadge, SetSection } from './review-bits';

const jobState = (project: ProjectDetail, type: string) => {
  const jobs = project.jobs.filter((j) => j.type === type);
  const generating = jobs.some((j) => j.status === 'queued' || j.status === 'running');
  const failed =
    !generating && jobs[0]?.status === 'failed' ? (jobs[0].last_error ?? 'failed') : null;
  return { generating, failed };
};

/** CTAs & hooks (cta_generate): one card per platform group with each field and its target length. */
export function CtasPanel({ project, timeZone }: { project: ProjectDetail; timeZone: string }) {
  const { set, items } = project.ctas;
  const { generating, failed } = jobState(project, 'generate_ctas');
  const regenerate = useRegenerateExtras(project.id, 'ctas');
  const blogApproved = project.blogs.some((b) => b.status === 'approved');

  return (
    <SetSection
      id="ctas"
      title="CTAs & hooks"
      projectId={project.id}
      timeZone={timeZone}
      set={set}
      items={items}
      generating={generating}
      failedError={failed}
      canGenerate={blogApproved}
      emptyText="Calls-to-action and image text for every platform are written once the blog is approved."
      workingText="Writing CTAs and hooks for every platform… about 30 seconds. This updates by itself."
      notesPlaceholder="e.g. softer email CTAs, mention the worksheet, shorter quotes"
      regenerate={regenerate}
    >
      <ul className="grid gap-3 xl:grid-cols-2">
        {CTA_GROUPS.map(({ key, label }) => {
          const item = items.find((i) => i.cta_group === key);
          if (!item) return null;
          const targets = CTA_TARGETS[key as CtaGroup] ?? {};
          return (
            <li key={key} className="space-y-3 rounded-md border border-line p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{label}</span>
                <ItemStatusBadge item={item} />
              </div>
              <dl className="space-y-2 text-sm">
                {Object.entries(item.extra)
                  .filter(([, v]) => typeof v === 'string' && v)
                  .map(([k, v]) => {
                    const text = v as string;
                    const max = targets[k];
                    return (
                      <div key={k}>
                        <dt className="text-xs font-medium uppercase tracking-wider text-muted">
                          {fieldLabel(k)}
                          {max && (
                            <span
                              className={cn(
                                'ml-2 font-mono normal-case',
                                text.length > max + 2 ? 'text-warning' : '',
                              )}
                            >
                              {text.length}/{max}
                            </span>
                          )}
                        </dt>
                        <dd>{text}</dd>
                      </div>
                    );
                  })}
              </dl>
              <ItemDecision item={item} projectId={project.id} busy={generating} />
            </li>
          );
        })}
      </ul>
    </SetSection>
  );
}

const POLL_PLATFORMS = [
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'x', label: 'X' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'tiktok', label: 'TikTok' },
  { key: 'facebook', label: 'Facebook' },
] as const;

/** 5 Yes/No polls (poll_generate), with where each has been posted. */
export function PollsPanel({ project, timeZone }: { project: ProjectDetail; timeZone: string }) {
  const { set, items } = project.polls;
  const { generating, failed } = jobState(project, 'generate_polls');
  const regenerate = useRegenerateExtras(project.id, 'polls');
  const updatePoll = useUpdatePoll(project.id);
  const blogApproved = project.blogs.some((b) => b.status === 'approved');

  return (
    <SetSection
      id="polls"
      title="Polls"
      projectId={project.id}
      timeZone={timeZone}
      set={set}
      items={items}
      generating={generating}
      failedError={failed}
      canGenerate={blogApproved}
      emptyText="Five Yes/No poll questions (LinkedIn, X, Instagram, TikTok, Facebook) are written once the blog is approved."
      workingText="Writing 5 poll questions… about 20 seconds. This updates by itself."
      notesPlaceholder="e.g. more about team decisions, less about job loss"
      regenerate={regenerate}
    >
      <ol className="space-y-3">
        {[...items]
          .sort((a, b) => (a.occurrence ?? 0) - (b.occurrence ?? 0))
          .map((item) => (
            <li key={item.id} className="space-y-3 rounded-md border border-line p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wider text-muted">
                  Poll {item.occurrence} · {item.graphic_text}
                </span>
                <ItemStatusBadge item={item} />
              </div>
              <p className="text-base font-medium">
                {item.caption}{' '}
                <span className="font-mono text-xs font-normal text-muted">
                  ({item.caption.length}/120)
                </span>
              </p>
              <p className="text-sm text-muted">
                {typeof item.extra.expected_split === 'string' && (
                  <>Expected split {item.extra.expected_split}. </>
                )}
                {typeof item.extra.why_engaging === 'string' && item.extra.why_engaging}
                {typeof item.extra.platform_note === 'string' && item.extra.platform_note && (
                  <> · {item.extra.platform_note}</>
                )}
              </p>
              {item.status === 'approved' && (
                <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <legend className="mb-1 text-xs font-medium uppercase tracking-wider text-muted">
                    Posted on
                  </legend>
                  {POLL_PLATFORMS.map((p) => {
                    const on = item.posted_on.includes(p.key);
                    return (
                      <label key={p.key} className="flex min-h-touch items-center gap-2">
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={updatePoll.isPending}
                          onChange={() =>
                            updatePoll.mutate({
                              itemId: item.id,
                              posted_on: on
                                ? item.posted_on.filter((x) => x !== p.key)
                                : [...item.posted_on, p.key],
                            })
                          }
                        />
                        {p.label}
                      </label>
                    );
                  })}
                </fieldset>
              )}
              <ItemDecision item={item} projectId={project.id} busy={generating} />
            </li>
          ))}
      </ol>
    </SetSection>
  );
}
