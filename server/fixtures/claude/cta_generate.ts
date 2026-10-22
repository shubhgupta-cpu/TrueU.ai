// Mock cta_generate response (CTA and Hook Generation Agent v3.7). Placeholder wording for tests and
// MOCK_EXTERNAL=true only; lengths sit inside the prompt's targets.
export default {
  video_id: 'vid202610010',
  ctas: {
    youtube_description: {
      email_cta: 'Get one reflective question each week in your inbox: join the TrueU.ai list.',
      lead_magnet_cta:
        'Download the free decision worksheet and think it through at your own pace.',
      blog_cta: 'Read the full article on the TrueU.ai blog for the questions behind this video.',
      subscribe_cta:
        'Subscribe for calm, honest conversations about the decisions that shape a career.',
    },
    youtube_pinned: {
      primary_cta:
        'Want a private space to think this through? Start with the free worksheet linked above.',
    },
    linkedin: {
      quote_text:
        'The question is rarely whether your role will change. It is which part of your work you want to protect.',
      caption_cta: 'If this landed, the full article walks through the questions in more depth.',
      comment_cta:
        'Free worksheet for thinking through what to automate and what to keep: link in the post.',
    },
    instagram: {
      label: 'FUTURE OF WORK',
      title: 'What to automate and what to keep human on your team',
      reel_overlay_cta: 'Read the article →',
      bio_link_cta: 'The full article and a free worksheet are in our bio link.',
      caption_cta: 'Save this and grab the free worksheet from the link in our bio.',
    },
    twitter: {
      quote_text: 'Automation decides what is fast. You still decide what matters.',
      handle: 'Think it through',
      thread_cta: 'Want the worksheet behind this thread? Join the TrueU.ai list for a free copy.',
      bio_cta: 'Weekly questions for clearer career decisions.',
    },
    facebook: {
      quote_text:
        'When the tools change, the real question is what you want your work to stand for. That answer is still yours to shape.',
      caption_cta: 'Read the full article for the questions we keep coming back to.',
      comment_cta: 'Free worksheet for working through this decision: link here.',
    },
    pinterest: {
      title: 'How to Decide What to Automate and What to Keep Human',
      points:
        'Name the work only you can do. Ask who is accountable. Keep the conversations that build trust on your team.',
      url: 'Read the article',
    },
  },
  lead_magnet_match: { recommended: 'Decision worksheet', relevance_score: 8 },
};
