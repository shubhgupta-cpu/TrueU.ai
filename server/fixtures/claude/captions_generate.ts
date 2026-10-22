// Mock captions_generate response in the shape of the client's Social Media Content Generator v2.4.
// Placeholder wording for tests and MOCK_EXTERNAL=true only; lengths sit inside the prompt's limits.
const fill = (label: string, chars: number) => {
  const base = `${label}: placeholder sentence about thinking a decision through, written for layout checks. `;
  return base
    .repeat(Math.ceil(chars / base.length))
    .slice(0, chars)
    .trim();
};
const tags = (third: string, partner = true) =>
  `#TrueUai ${partner ? '#ThinkingPartner' : '#Clarity'} #${third}`;
const four = (make: (slot: string, i: number) => Record<string, unknown>) => ({
  image: make('image', 0),
  video_1: make('video_1', 1),
  video_2: make('video_2', 2),
  video_3: make('video_3', 3),
});

export default {
  content_title: 'The Course Question',
  linkedin: four((slot, i) => ({
    graphic_quote: `Clarity beats certainty, angle ${i + 1}.`,
    caption: fill(`LinkedIn ${slot}`, 1200),
    hashtags: tags('CareerClarity', i !== 3),
  })),
  linkedin_carousel: {
    image: {
      cover_title: '5 Questions Before Any Big Decision',
      cover_subtext: 'Swipe for insights',
      slides: [1, 2, 3, 4, 5].map((n) => ({
        number: n,
        headline: `Question ${n}`,
        body: 'A short placeholder explanation for this slide.',
      })),
      caption: fill('Carousel', 1100),
      hashtags: tags('DecisionMaking'),
    },
  },
  instagram: four((slot, i) => ({
    graphic_quote: `Pause before you decide, ${i + 1}.`,
    graphic_label: 'Career Decisions',
    caption: fill(`Instagram ${slot}`, 500),
    hashtags: tags('CareerClarity'),
  })),
  twitter: four((slot, i) => ({
    graphic_quote: `Clarity first, ${i + 1}.`,
    caption: fill(`X ${slot}`, 230),
    hashtags: tags('Decisions', i !== 2),
  })),
  facebook: four((slot) => ({
    graphic_quote: 'The question matters more than the answer.',
    caption: fill(`Facebook ${slot}`, 600),
    hashtags: tags('SelfReflection'),
  })),
  pinterest: four((slot) => ({
    graphic_title: 'Career Decision Tips: Find Clarity',
    graphic_points: 'Name what matters\nAsk better questions',
    description: fill(`Pinterest ${slot}`, 450),
    hashtags: tags('CareerAdvice'),
  })),
  threads: four((slot) => ({ caption: fill(`Threads ${slot}`, 320), hashtags: tags('Career') })),
  reels_tiktok: {
    video_1: { caption: fill('Reels 1', 120), hashtags: tags('CareerTok') },
    video_2: { caption: fill('Reels 2', 120), hashtags: tags('CareerTok') },
    video_3: { caption: fill('Reels 3', 120), hashtags: tags('CareerTok', false) },
  },
  validation: {
    all_graphics_within_limits: true,
    all_captions_within_limits: true,
    no_em_dashes_present: true,
    four_posts_per_platform: true,
    carousel_image_only: true,
    reels_tiktok_video_only: true,
    hashtags_are_space_separated_strings_not_in_captions: true,
    exactly_three_hashtags_per_post: true,
    errors: [],
  },
};
