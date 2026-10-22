// Mock blog_generate response in the shape of the client's Blog Post Generator v1.0.
// Placeholder wording for tests and MOCK_EXTERNAL=true only; not real content.
const para = (topic: string, n: number) =>
  Array.from(
    { length: n },
    (_, i) =>
      `Placeholder sentence ${i + 1} about ${topic}, written to give the section a realistic length for layout and word counts.`,
  ).join(' ');

export default {
  category: 'Work & Meaning',
  title: 'Is AI Upskilling Worth It? How to Think It Through Today',
  meta_description:
    'Is AI upskilling worth it for you? A calm way to think through your company course, what it signals, and what you really want next in your work life.',
  slug: 'how-to-think-through-ai-upskilling',
  primary_keyword: 'is ai upskilling worth it',
  word_count: 1750,
  content: {
    introduction: `Is AI upskilling worth it when your company is the one pushing it? ${para('the introduction', 7)}`,
    sections: [
      {
        h2: 'Why This Decision Feels So Hard',
        content: para('emotional validation', 13),
        word_count: 280,
      },
      { h2: 'What Is Really at Stake', content: para('the stakes', 13), word_count: 280 },
      {
        h2: 'Questions Worth Sitting With',
        content: para('reflective questions', 13),
        word_count: 280,
      },
      { h2: 'Finding Your Own Answer', content: para('empowerment', 13), word_count: 280 },
    ],
    trueu_section: {
      h2: 'When You Need Space to Think',
      content:
        'Some decisions need room more than advice. TrueU.ai is a private Thinking Partner that helps you explore your own thoughts, and over time it learns how you think. Your conversations are encrypted and never sold. ' +
        para('the space to think', 6),
      cta_text: 'Start a private conversation when you are ready.',
    },
    conclusion: `Is AI upskilling worth it for you? Only you can weigh it. ${para('the conclusion', 7)}`,
    cta_box: {
      headline: 'Think it through on your own terms',
      body: 'A private space to work through the decision in front of you, at your own pace.',
      button_text: 'Start Thinking with TrueU.ai',
      button_url: 'https://trueu.ai/start?utm_source=blog&utm_medium=cta&utm_campaign={slug}',
    },
  },
  seo: {
    internal_links: [
      { anchor_text: 'Deciding when to leave a job', url: '/blog/deciding-when-to-leave' },
    ],
    external_links: [
      {
        anchor_text: 'World Economic Forum: Future of Jobs',
        url: 'https://www.weforum.org/reports/',
      },
    ],
    featured_image_suggestion: 'A person at a desk at dusk, laptop open, looking out of a window.',
  },
  brand_checklist: {
    trueu_ai_spelled_correctly: true,
    thinking_partner_used: true,
    evolution_message_included: true,
    no_forbidden_terms: true,
  },
};
