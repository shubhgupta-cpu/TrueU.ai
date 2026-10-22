// A blog version as a document: Markdown (stored in Airtable, uploaded as .md) and Word (.docx).
// Section text from the prompt may contain **bold**, [links](url) and "- " bullets.
import { Document, ExternalHyperlink, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import { type Blog, blogSections } from './schemas/blog.js';

export interface BlogDocMeta {
  projectTitle: string;
  version: number;
  category: string | null;
  wordCount: number;
  generatedAt: string;
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

export function blogMarkdown(b: Blog, meta: BlogDocMeta): string {
  const c = b.content;
  const L: string[] = [
    `# ${b.title}`,
    '',
    `*${meta.projectTitle} · Blog v${meta.version}${meta.category ? ` · ${meta.category}` : ''} · ${meta.wordCount} words · ${meta.generatedAt}*`,
    '',
    `**Meta description:** ${b.meta_description}  `,
    `**Slug:** ${b.slug}  `,
    `**Primary keyword:** ${b.primary_keyword}`,
    '',
    c.introduction,
    '',
  ];
  for (const s of blogSections(b)) L.push(`## ${s.h2}`, '', s.content, '');
  if (c.trueu_section.cta_text) L.push(`*${c.trueu_section.cta_text}*`, '');
  L.push('## Conclusion', '', c.conclusion, '');
  L.push(
    '---',
    '',
    `### ${c.cta_box.headline}`,
    '',
    c.cta_box.body,
    '',
    `[${c.cta_box.button_text}](${c.cta_box.button_url.replace('{slug}', b.slug)})`,
    '',
    '---',
    '',
    '## SEO notes',
    '',
  );
  if (b.seo.internal_links.length)
    L.push('**Internal links:**', ...b.seo.internal_links.map((l) => `- ${linkText(l)}`), '');
  if (b.seo.external_links.length)
    L.push('**External links:**', ...b.seo.external_links.map((l) => `- ${linkText(l)}`), '');
  if (b.seo.featured_image_suggestion)
    L.push(`**Featured image:** ${b.seo.featured_image_suggestion}`);
  return `${L.join('\n')}\n`;
}

// ---- Word

/** **bold** and [text](url) inside a line → runs. */
function runs(line: string, size = 24): Array<TextRun | ExternalHyperlink> {
  const out: Array<TextRun | ExternalHyperlink> = [];
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\((https?:[^)\s]+)\)/g;
  let last = 0;
  for (const m of line.matchAll(re)) {
    if (m.index! > last) out.push(new TextRun({ text: line.slice(last, m.index), size }));
    if (m[1]) out.push(new TextRun({ text: m[1], bold: true, size }));
    else
      out.push(
        new ExternalHyperlink({
          link: m[3]!,
          children: [new TextRun({ text: m[2]!, style: 'Hyperlink', size })],
        }),
      );
    last = m.index! + m[0].length;
  }
  if (last < line.length) out.push(new TextRun({ text: line.slice(last), size }));
  return out;
}

/** A block of prose: paragraphs split on blank lines, "- " / "* " lines as bullets. */
function prose(textBlock: string): Paragraph[] {
  const out: Paragraph[] = [];
  for (const para of textBlock.split(/\n\s*\n/)) {
    const lines = para.split('\n').filter((l) => l.trim());
    if (lines.length && lines.every((l) => /^\s*[-*•]\s+/.test(l))) {
      for (const l of lines)
        out.push(
          new Paragraph({ bullet: { level: 0 }, children: runs(l.replace(/^\s*[-*•]\s+/, '')) }),
        );
    } else if (lines.length) {
      out.push(new Paragraph({ spacing: { after: 160 }, children: runs(lines.join(' ')) }));
    }
  }
  return out;
}

const label = (name: string, value: string) =>
  new Paragraph({
    spacing: { after: 60 },
    children: [
      new TextRun({ text: `${name}: `, bold: true, size: 20 }),
      new TextRun({ text: value, size: 20 }),
    ],
  });

export async function blogDocx(b: Blog, meta: BlogDocMeta): Promise<Uint8Array> {
  const c = b.content;
  const children: Paragraph[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(b.title)] }),
    new Paragraph({
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: `${meta.projectTitle} · Blog v${meta.version}${meta.category ? ` · ${meta.category}` : ''} · ${meta.wordCount} words · ${meta.generatedAt}`,
          color: '625E55',
          size: 20,
        }),
      ],
    }),
    label('Meta description', b.meta_description),
    label('Slug', b.slug),
    label('Primary keyword', b.primary_keyword),
    new Paragraph({ text: '' }),
    ...prose(c.introduction),
  ];
  for (const s of blogSections(b)) {
    children.push(
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(s.h2)] }),
      ...prose(s.content),
    );
  }
  if (c.trueu_section.cta_text) children.push(...prose(`**${c.trueu_section.cta_text}**`));
  children.push(
    new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('Conclusion')] }),
    ...prose(c.conclusion),
    new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(c.cta_box.headline)] }),
    ...prose(c.cta_box.body),
    new Paragraph({
      spacing: { after: 300 },
      children: [
        new ExternalHyperlink({
          link: c.cta_box.button_url.replace('{slug}', b.slug),
          children: [
            new TextRun({ text: c.cta_box.button_text, style: 'Hyperlink', bold: true, size: 24 }),
          ],
        }),
      ],
    }),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun('SEO notes (not part of the article)')],
    }),
  );
  if (b.seo.internal_links.length) {
    children.push(
      label('Internal links', ''),
      ...b.seo.internal_links.map(
        (l) =>
          new Paragraph({
            bullet: { level: 0 },
            children: [new TextRun({ text: linkText(l), size: 20 })],
          }),
      ),
    );
  }
  if (b.seo.external_links.length) {
    children.push(
      label('External links', ''),
      ...b.seo.external_links.map(
        (l) =>
          new Paragraph({
            bullet: { level: 0 },
            children: [new TextRun({ text: linkText(l), size: 20 })],
          }),
      ),
    );
  }
  if (b.seo.featured_image_suggestion)
    children.push(label('Featured image', b.seo.featured_image_suggestion));

  const doc = new Document({
    creator: 'TrueU Content Cockpit',
    title: b.title,
    styles: { default: { document: { run: { font: 'Calibri' } } } },
    sections: [{ properties: {}, children }],
  });
  return new Uint8Array(await Packer.toBuffer(doc));
}
