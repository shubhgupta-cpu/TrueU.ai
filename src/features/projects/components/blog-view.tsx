import { Fragment, type ReactNode } from 'react';
import type { Blog, BlogVersion } from '@/types/api';

/** **bold** and [text](url) inside a line. */
function inline(line: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\((https?:[^)\s]+)\)/g;
  let last = 0;
  let i = 0;
  for (const m of line.matchAll(re)) {
    if (m.index! > last) out.push(line.slice(last, m.index));
    if (m[1]) out.push(<strong key={i++}>{m[1]}</strong>);
    else {
      out.push(
        <a key={i++} href={m[3]} target="_blank" rel="noreferrer" className="text-accent underline">
          {m[2]}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>,
      );
    }
    last = m.index! + m[0].length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}

/** Paragraphs split on blank lines; "- " lines as a list. */
function Prose({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n\s*\n/).map((para, i) => {
        const lines = para.split('\n').filter((l) => l.trim());
        if (!lines.length) return null;
        if (lines.every((l) => /^\s*[-*•]\s+/.test(l))) {
          return (
            <ul key={i} className="list-disc space-y-2 pl-6">
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\s*[-*•]\s+/, ''))}</li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{inline(lines.join(' '))}</p>;
      })}
    </>
  );
}

const linkText = (l: unknown): string => {
  if (typeof l === 'string') return l;
  const o = (l ?? {}) as Record<string, unknown>;
  const label = [o.anchor_text, o.title, o.text, o.topic, o.suggested_title].find(
    (v) => typeof v === 'string',
  );
  const url = [o.url, o.href, o.link, o.slug].find((v) => typeof v === 'string');
  return [label, url].filter(Boolean).join(' — ') || JSON.stringify(o);
};

/** The TrueU.ai section sits after 2–3 body sections (mirrors server/schemas/blog.ts). */
function ordered(b: Blog) {
  const body = b.content.sections.map((s) => ({ h2: s.h2, content: s.content, trueu: false }));
  const at = Math.min(3, Math.max(2, body.length - 1));
  return [...body.slice(0, at), { ...b.content.trueu_section, trueu: true }, ...body.slice(at)];
}

/** The blog as the reader would see it, plus SEO details and the prompt's checklist warnings. */
export function BlogView({ version }: { version: BlogVersion }) {
  const b = version.blog;
  if (!b) {
    return (
      <p role="alert" className="text-sm text-danger">
        This version’s blog data couldn’t be read. Regenerate the blog.
      </p>
    );
  }
  const c = b.content;
  return (
    <div className="space-y-8">
      <dl className="grid gap-x-4 gap-y-2 rounded-md bg-ground p-4 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="font-semibold text-ink">Meta description</dt>
        <dd>
          {b.meta_description}{' '}
          <span className="font-mono text-muted">({b.meta_description.length}/160)</span>
        </dd>
        <dt className="font-semibold text-ink">Slug</dt>
        <dd className="font-mono">{b.slug}</dd>
        <dt className="font-semibold text-ink">Primary keyword</dt>
        <dd>{b.primary_keyword}</dd>
        {version.category && (
          <>
            <dt className="font-semibold text-ink">Category</dt>
            <dd>{version.category}</dd>
          </>
        )}
        <dt className="font-semibold text-ink">Length</dt>
        <dd className="font-mono">{version.word_count ?? '—'} words</dd>
      </dl>

      {version.warnings.length > 0 && (
        <details className="rounded-md bg-warning-soft px-4 py-2 text-sm text-warning">
          <summary className="min-h-touch cursor-pointer py-2">
            {version.warnings.length} checklist item{version.warnings.length === 1 ? '' : 's'} not
            met. Review before approving
          </summary>
          <ul className="list-disc space-y-1 pb-2 pl-5">
            {version.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </details>
      )}

      <article className="space-y-5 text-[17px] leading-8">
        <h3 className="text-3xl font-bold leading-tight">
          {b.title}{' '}
          <span className="font-mono text-xs font-normal text-muted">({b.title.length}/60)</span>
        </h3>
        <Prose text={c.introduction} />
        {ordered(b).map((s) => (
          <Fragment key={s.h2}>
            <h4 className="border-l-4 border-accent pl-3 pt-4 text-2xl font-bold leading-snug">
              {s.h2}
              {s.trueu && (
                <span className="ml-2 align-middle text-xs font-normal text-accent">
                  TrueU.ai section
                </span>
              )}
            </h4>
            <Prose text={s.content} />
          </Fragment>
        ))}
        {c.trueu_section.cta_text && <p className="italic">{c.trueu_section.cta_text}</p>}
        <h4 className="border-l-4 border-accent pl-3 pt-4 text-2xl font-bold leading-snug">
          Conclusion
        </h4>
        <Prose text={c.conclusion} />
        <aside className="rounded-lg border border-accent/30 bg-accent-soft p-5">
          <p className="text-xl font-bold">{c.cta_box.headline}</p>
          <p className="mt-1">{c.cta_box.body}</p>
          <p className="mt-2 text-sm font-medium text-accent">
            {c.cta_box.button_text} →{' '}
            <span className="break-all font-mono text-xs">
              {c.cta_box.button_url.replace('{slug}', b.slug)}
            </span>
          </p>
        </aside>
      </article>

      <section className="space-y-3 border-t border-line pt-6 text-sm">
        <h4 className="font-sans text-xs font-semibold uppercase tracking-wider text-muted">
          SEO notes
        </h4>
        {b.seo.internal_links.length > 0 && (
          <div>
            <p className="font-medium">Internal links</p>
            <ul className="list-disc pl-5 text-muted">
              {b.seo.internal_links.map((l, i) => (
                <li key={i}>{linkText(l)}</li>
              ))}
            </ul>
          </div>
        )}
        {b.seo.external_links.length > 0 && (
          <div>
            <p className="font-medium">External links</p>
            <ul className="list-disc pl-5 text-muted">
              {b.seo.external_links.map((l, i) => (
                <li key={i}>{linkText(l)}</li>
              ))}
            </ul>
          </div>
        )}
        {b.seo.featured_image_suggestion && (
          <p>
            <span className="font-medium">Featured image:</span>{' '}
            <span className="text-muted">{b.seo.featured_image_suggestion}</span>
          </p>
        )}
      </section>
    </div>
  );
}
