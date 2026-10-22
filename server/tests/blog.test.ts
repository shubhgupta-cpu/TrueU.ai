// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { blogDocx, blogMarkdown } from '../blog-doc.js';
import { validateOutput } from '../claude.js';
import { claudeFixtures } from '../fixtures/index.js';
import { blogFileName, layoutFrom } from '../paths.js';
import {
  Blog,
  blogCategory,
  blogInput,
  blogSections,
  blogWarnings,
  blogWordCount,
  scriptSummary,
} from '../schemas/blog.js';
import { Script } from '../schemas/script.js';

const fixture = claudeFixtures.blog_generate![0];
const blog = Blog.parse(fixture);
const clone = () => Blog.parse(structuredClone(fixture));
const meta = {
  projectTitle: 'AI course',
  version: 1,
  category: 'Work & Meaning',
  wordCount: 1700,
  generatedAt: '2026-10-14',
};

describe('blog output (Blog Post Generator v1.0)', () => {
  it('accepts the "Category:" line the prompt puts above the JSON', () => {
    const { category: _c, ...withoutCategory } = structuredClone(fixture) as Record<
      string,
      unknown
    >;
    void _c;
    const raw = `Category: Work & Meaning\n${JSON.stringify(withoutCategory)}`;
    const v = validateOutput(raw, Blog);
    expect(v.ok).toBe(true);
    expect(v.ok && blogCategory(v.data, raw)).toBe('Work & Meaning');
  });

  it('requires the content sections, TrueU.ai section and CTA box', () => {
    const raw = structuredClone(fixture) as { content: Record<string, unknown> };
    expect(
      Blog.safeParse({ ...raw, content: { ...raw.content, trueu_section: undefined } }).success,
    ).toBe(false);
    expect(Blog.safeParse({ ...raw, content: { ...raw.content, sections: [] } }).success).toBe(
      false,
    );
    expect(
      Blog.safeParse({ ...raw, content: { ...raw.content, cta_box: undefined } }).success,
    ).toBe(false);
  });

  it('places the TrueU.ai section after 2–3 body sections', () => {
    const order = blogSections(blog).map((s) => !!s.trueu);
    expect(order.indexOf(true)).toBe(3); // 4 body sections → after the 3rd
    const three = clone();
    three.content.sections = three.content.sections.slice(0, 3);
    expect(blogSections(three).findIndex((s) => s.trueu)).toBe(2);
  });

  it('applies the prompt checklist as warnings', () => {
    expect(blogWarnings(blog, 'Category: Work & Meaning')).toEqual(
      expect.not.arrayContaining([expect.stringMatching(/Title is/)]),
    );
    const b = clone();
    b.title = 'Short title';
    b.category = undefined;
    b.content.introduction = 'TrueU.ai helps. You should decide. It is an amazing assistant.';
    b.content.trueu_section.content = 'A private space.';
    const w = blogWarnings(b, '').join('\n');
    expect(w).toContain('Title is 11 characters');
    expect(w).toContain('introduction mentions TrueU.ai');
    expect(w).toContain('"Thinking Partner" is missing');
    expect(w).toContain('Evolution message appears 0 times');
    expect(w).toContain('Forbidden terms used (check context): assistant');
    expect(w).toContain('Hype language: amazing');
    expect(w).toContain('prescriptive "you should"');
    expect(w).toContain('No category was chosen');
  });

  it('counts words across the article', () => {
    expect(blogWordCount(blog)).toBeGreaterThan(1000);
  });

  it('fills the prompt inputs from the topic, score and approved script', () => {
    const script = Script.parse(claudeFixtures.script_generate![0]);
    const input = blogInput({
      topicTitle: 'Learn or leave?',
      category: null,
      evaluation: {
        criteria_scores: { search_intent: { search_phrases: ['a', 'b', 'c'], reasoning: 'why' } },
      },
      script,
    });
    expect(input.primary_keyword).toBe('a');
    expect(input.secondary_keywords.startsWith('b, c, ')).toBe(true);
    expect(input.decision_domain).toBe('Security'); // shared value when the topic has no category
    expect(input.search_intent).toBe('why');
    expect(input.script_summary).toContain('Scene 6:');
    expect(scriptSummary(script)).not.toContain('Camera');
  });

  it('builds Markdown and a .docx, and goes to the Blog_Script folder', async () => {
    const md = blogMarkdown(blog, meta);
    expect(md.startsWith(`# ${blog.title}`)).toBe(true);
    expect(md).toContain('## When You Need Space to Think');
    expect(md).toContain('utm_campaign=how-to-think-through-ai-upskilling');
    const bytes = await blogDocx(blog, meta);
    expect(String.fromCharCode(bytes[0]!, bytes[1]!)).toBe('PK');
    expect(`${layoutFrom(null).blog_folder}/${blogFileName('docx')}`).toBe(
      'Blog_Script/blog_APPROVED.docx',
    );
  });
});
