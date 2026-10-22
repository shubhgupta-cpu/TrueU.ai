// Mock script_generate response in the shape of the client's Storyboard Creation Prompt v2.0.
// Placeholder wording for tests and MOCK_EXTERNAL=true only; not real content.
const para = (topic: string) =>
  Array.from(
    { length: 8 },
    (_, i) =>
      `Placeholder narration sentence ${i + 1} about ${topic}, written to fill the scene at a natural speaking pace for the editor to time.`,
  ).join(' ');

const scene = (n: number, range: string, beat: string) => ({
  time_range: range,
  narration: para(`scene ${n}`),
  on_screen_text: [`Scene ${n} line one`, `Scene ${n} line two`],
  b_roll: 'Hands around a kitchen table, slow push in.',
  narrator_background: 'A quiet room with soft daylight.',
  camera: 'Medium shot, eye level.',
  music: 'Soft piano, low in the mix.',
  emotional_beat: beat,
});

const tease =
  'When you are weighing a training offer at work, TrueU.ai is Private Intelligence. A thinking partner that gives you private space to work through YOUR specific situation.';

export default {
  episode_metadata: {
    topic: 'Should I take the AI course my company is pushing, or start looking elsewhere?',
    episode_title: 'The Course Question',
    shared_value: 'Security',
    total_runtime: { english: '11:00', other_languages: '11:30-12:00' },
  },
  opening_examples: {
    example_a: {
      perspective: 'A manager who signed up on day one',
      story:
        'She sees the course as a way to stay relevant. She believes the team that learns first keeps its place.',
      shared_value_expression: 'For her, learning is how she protects her job.',
    },
    example_b: {
      perspective: 'An analyst who is quietly updating his CV',
      story:
        'He reads the course as a signal that roles are changing. In his view, it is safer to look outside now.',
      shared_value_expression: 'For him, options are how he protects his future.',
    },
    connecting_statement: 'Both are looking for the same thing: security.',
  },
  long_form_storyboard: {
    scene_1: scene(1, '0:30-2:00', 'Connection'),
    scene_2: scene(2, '2:00-3:30', 'Understanding'),
    scene_3: scene(3, '3:30-5:30', 'Recognition'),
    scene_4: scene(4, '5:30-7:00', 'Reflection'),
    scene_5: scene(5, '7:00-9:00', 'Empathy'),
    scene_6: scene(6, '9:00-10:00', 'Calm Resolution'),
    scene_7_cta: {
      time_range: '10:00-10:15',
      narration:
        "If you are weighing a course your company is pushing, TrueU.ai is Private Intelligence. A thinking partner that gives you private space to work through YOUR specific situation. Your conversations are never sold and never used to train AI models. Start with: 'What would this course change for me?' TrueU.ai.",
      on_screen_text_progression: [
        '0:00-0:03: No text',
        '0:03-0:08: Private Intelligence. Private Space.',
        '0:08-0:12: A Thinking Partner. Structured Reflection.',
        "0:12-0:15: 'What would this course change for me?' TrueU.ai",
      ],
      narrator_background: 'The same quiet room, lamp on.',
      camera: 'Slow push to close-up.',
      music: 'Piano resolves to a single held chord.',
      emotional_beat: 'Invitation and Clarity',
    },
    scene_8_outro: {
      time_range: '10:15-11:00',
      core_message:
        'Clarity does not come from choosing sides. It comes from choosing to look deeper.',
      note: 'Provided separately',
    },
  },
  narrator_backgrounds: [
    'Connection',
    'Understanding',
    'Recognition',
    'Reflection',
    'Empathy',
    'Calm Resolution',
    'Invitation and Clarity',
  ].map((beat, i) => ({
    scene: `Scene ${i + 1}`,
    description: 'A quiet room with plants and a desk.',
    lighting: 'soft daylight',
    emotional_alignment: beat,
  })),
  short_form_clips: [
    'Connection',
    'Reflection',
    'Recognition',
    'Hope',
    'Calm',
    'Topic-resonant',
  ].map((tone, i) => ({
    clip_id: i + 1,
    title: `Clip ${i + 1}: the course question`,
    duration: '0:50',
    hook_content:
      'Your company announces a course. Some people sign up at once. Others start looking elsewhere. Both might be protecting the same thing. What would it look like to ask what you are protecting, before you decide which way to move?',
    platform_tease: tease,
    cta: 'TrueU.ai',
    visual: 'Close-up of an email notification, then a window view.',
    music: 'soft piano',
    emotional_tone: tone,
  })),
  youtube_optimization: {
    title: 'The Course Question: Learn or Leave?',
    description:
      'Your company offers an AI course. Some colleagues sign up, others start looking elsewhere. In this episode we look at what both might be protecting. TrueU.ai is Private Intelligence, a thinking partner that gives you private space to work through your own situation. Your conversations are never sold and never used to train AI models. TrueU.ai',
    tags: ['career', 'ai at work', 'upskilling', 'decisions', 'job security'],
    hashtags: ['#TrueU.ai', '#PrivateIntelligence', '#CommonGround', '#Security'],
    thumbnail_concept: 'A laptop with a course invite and a CV side by side, text: Learn or Leave?',
  },
  closing_reflection:
    'What are you protecting when you say yes, or no? And is there a way to protect it that you have not considered yet?',
  clip_timestamps: [
    {
      clip_number: 1,
      timecode: '1:00-1:45',
      hook_line: 'Both might be protecting the same thing.',
      scene_location: 'Scene 1',
    },
    {
      clip_number: 2,
      timecode: '5:45-6:30',
      hook_line: 'What are you protecting?',
      scene_location: 'Scene 4',
    },
    {
      clip_number: 3,
      timecode: '8:00-8:45',
      hook_line: 'Security could look different.',
      scene_location: 'Scene 5',
    },
  ],
  transition_notes:
    'Each scene ends on a question that the next scene picks up. Music carries across cuts.',
};
