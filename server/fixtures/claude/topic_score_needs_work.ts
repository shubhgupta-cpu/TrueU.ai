export default {
  evaluation: {
    topic: 'Finding balance in a changing world',
    criteria_scores: {
      search_intent: {
        score: 4,
        reasoning: 'Nobody searches this phrasing; it is too abstract.',
        search_phrases: [
          'how to deal with burnout at work',
          'should i change careers',
          'how to make a hard decision',
        ],
        improvements: [
          'Rephrase around a searched question such as "should I change careers" +4 pts',
        ],
      },
      personal_consequence: {
        score: 6,
        reasoning: 'Implies wellbeing stakes but names no concrete loss.',
        improvements: [
          'Name the concrete stake: the job, the relationship, the health risk +3 pts',
        ],
      },
      fear_curiosity: {
        score: 5,
        fear_identified: 'A vague fear of falling behind.',
        curiosity_gap: 'None stated.',
        improvements: [
          "Add a specific mechanism they're missing, e.g. why rest makes the decision harder +3 pts",
        ],
      },
      specific_person: {
        score: 5,
        person_description:
          'Anyone feeling stretched by change. No situation or trigger is identifiable.',
        improvements: ['Target a mid-career professional facing a specific crossroads +4 pts'],
      },
      urgency: {
        score: 4,
        reasoning: 'No triggering event or deadline.',
        deadline_check: 'No deadline present.',
        improvements: ['Anchor to a triggering event that has already happened +4 pts'],
      },
      platform_invitation: {
        score: 8,
        reasoning: 'Balance questions are values-laden and benefit from structured thinking.',
        first_conversation_test:
          "Everything at work keeps changing and I don't know what to hold on to. Can you help me sort out what matters?",
        improvements: ['Make the competing trade-off explicit +1 pts'],
      },
    },
    total_score: 32,
    score_breakdown: {
      search_intent: 4,
      personal_consequence: 6,
      fear_curiosity: 5,
      specific_person: 5,
      urgency: 4,
      platform_invitation: 8,
    },
    recommendation: 'REJECT',
    trigger_moment: 'Life Crossroads',
    icp_alignment: 'Weak',
    icp_alignment_notes: 'Too generic to reach the ICP at a decision moment.',
    top_improvements: [
      'Rewrite as a specific, searched decision question with a trigger event +8 pts',
      'Name the person (mid-career, just passed over for promotion) and the stake +6 pts',
      'Add the real deadline that forces the decision +4 pts',
    ],
    storyboard: {
      topic: '',
      episode_title: '',
      shared_value: '',
      side_a_cares_about: '',
      side_b_cares_about: '',
      shared_deeper_need: '',
    },
    summary:
      'The topic is too abstract to score well. Its strength is that balance is a genuine thinking-partner problem. It needs a specific person, trigger and searched phrasing before use.',
  },
};
