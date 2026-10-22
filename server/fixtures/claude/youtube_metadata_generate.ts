// Mock youtube_metadata_generate response (YouTube SEO Metadata Generator v2.0). Placeholder
// wording for tests and MOCK_EXTERNAL=true only; lengths sit inside the prompt's limits.
const filler = (n: number) =>
  Array.from(
    { length: n },
    (_, i) =>
      `Placeholder sentence ${i + 1} about thinking a work decision through, for layout checks.`,
  ).join(' ');

const description = [
  `Is AI upskilling worth it when your company is the one pushing it? ${filler(2)}`,
  filler(4),
  '0:00 - Introduction\n0:30 - Opening Examples\n2:00 - Context and Tension\n3:30 - Emotional Root\n5:30 - Bridge Questions\n7:00 - Common-Ground Reframe\n9:00 - Reflection\n10:00 - TrueU.ai: Your Private Thinking Partner',
  [
    '• First insight about the decision.',
    '• Second insight about what it protects.',
    '• Third insight about better questions.',
  ].join('\n'),
  `About TrueU.ai:\nTrueU.ai is your private Thinking Partner, an AI that helps you think through life's biggest decisions. It learns how you think.\n✓ Private & Encrypted\n✓ Learns Your Thinking Style\n✓ No Advice, Just Clarity\nLearn More about TrueU.ai: https://trueu.ai/`,
  'Connect With Us\nWebsite: https://trueu.ai\nLinkedIn: https://www.linkedin.com/company/106456119/\nInstagram: https://www.instagram.com/trueu.ai',
  filler(8),
  '#TrueUai #ThinkingPartner #CareerClarity #FutureOfWork',
].join('\n\n');

export default {
  language: 'EN',
  video_id: 'vid202610010',
  titles: {
    recommended: 'Is AI Upskilling Worth It? How to Know What Is Right For You',
    options: [
      'Is AI Upskilling Worth It? How to Know What Is Right For You',
      'The Real Reason the AI Course Question Feels So Hard Today',
      'Should You Take the AI Course or Leave? Here Is How to Know',
      'What No One Tells You About Company AI Training Programs',
      'AI Upskilling or a New Job: A Framework for Clarity at Work',
    ],
  },
  description: {
    full_text: description,
    timestamps_included: true,
    trueu_section_included: true,
    cta_url: 'https://trueu.ai/',
  },
  tags: [
    'is ai upskilling worth it',
    'should i take ai training',
    'company ai course',
    'ai upskilling',
    'ai at work',
    'career change',
    'future of work',
    'job security',
    'learn or leave',
    'should i quit my job for ai',
    'is my job safe from ai',
    'TrueU.ai',
    'Thinking Partner',
    'Private AI',
    'decision making',
    'life advice',
  ],
  thumbnail_text_options: [
    { headline: 'LEARN OR LEAVE?', subtext: 'The AI course question' },
    { headline: 'THE HARD TRUTH', subtext: 'What training really signals' },
    { headline: 'BEFORE YOU SIGN UP', subtext: 'Ask this one question first' },
  ],
  seo_notes: {
    primary_keyword: 'is ai upskilling worth it',
    search_volume_estimate: 'medium',
    competition: 'medium',
    recommended_title_rationale: 'Keyword first, promises clarity.',
  },
  brand_checklist: { trueu_ai_in_description: true, thinking_partner_mentioned: true },
};
