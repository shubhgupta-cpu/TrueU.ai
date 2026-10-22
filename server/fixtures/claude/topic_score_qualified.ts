export default {
  evaluation: {
    topic:
      'Should I take the AI upskilling course my company is pushing — or start looking elsewhere?',
    criteria_scores: {
      search_intent: {
        score: 9,
        reasoning:
          'People actively search for whether employer AI training is worth it and whether AI will replace their role.',
        search_phrases: [
          'is ai training worth it',
          'will ai take my job',
          'should i learn ai for my career',
        ],
        improvements: ['Lead with the exact phrase "will AI take my job" in the title +1 pts'],
      },
      personal_consequence: {
        score: 9,
        reasoning: 'Career trajectory and job security are directly at stake.',
        improvements: [
          'Name the cost of choosing wrong (months of evenings, a missed internal move) +1 pts',
        ],
      },
      fear_curiosity: {
        score: 8,
        fear_identified: 'They fear becoming the person the reorg quietly leaves behind.',
        curiosity_gap:
          "They don't know which skills the course actually protects versus which are already commoditised.",
        improvements: ['Hint at the one question to ask HR before enrolling +2 pts'],
      },
      specific_person: {
        score: 8,
        person_description:
          "A mid-career manager whose company just announced an AI programme. They feel pressure to say yes but suspect it's a box-ticking exercise.",
        improvements: ['Specify the announcement moment (all-hands, email from the CEO) +2 pts'],
      },
      urgency: {
        score: 8,
        reasoning: 'The enrolment window creates an ongoing, real pressure.',
        deadline_check: 'Real — enrolment deadlines are set by the employer.',
        improvements: ['Reference the enrolment deadline explicitly +1 pts'],
      },
      platform_invitation: {
        score: 9,
        reasoning:
          "Values, identity and risk tolerance all compete; there's no single right answer.",
        first_conversation_test:
          "My company wants everyone to do their AI course by Friday and I can't tell if it's a lifeline or a sign I should leave. Help me think it through.",
        improvements: ['Frame both paths as legitimate to invite reflection +1 pts'],
      },
    },
    total_score: 51,
    score_breakdown: {
      search_intent: 9,
      personal_consequence: 9,
      fear_curiosity: 8,
      specific_person: 8,
      urgency: 8,
      platform_invitation: 9,
    },
    recommendation: 'GREENLIGHT',
    trigger_moment: "Navigating AI's Impact",
    icp_alignment: 'Strong',
    icp_alignment_notes: 'Squarely mid-career, values-laden and time-bound.',
    top_improvements: [
      'Put the enrolment deadline and the employer announcement in the title +3 pts',
    ],
    storyboard: {
      topic: 'Employer AI upskilling decision',
      episode_title: "Your company's AI course: lifeline or exit sign?",
      shared_value: 'Security',
      side_a_cares_about: "Staying valuable inside a company they've invested years in.",
      side_b_cares_about: "Not wasting effort on a programme that signals they're replaceable.",
      shared_deeper_need: 'Confidence that their next move protects their future.',
    },
    summary:
      'A strong, timely topic with clear stakes for the ICP. Its biggest strength is the concrete trigger of an employer-mandated AI course. It is ready to greenlight, with the deadline made explicit.',
  },
};
