// A script version as a document: Markdown (stored in Airtable, uploaded as .md) and Word (.docx,
// the copy the owner and the editor open from Dropbox). Built from the storyboard JSON.
import {
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { SCENE_KEYS, SCENE_NAMES, type Script } from './schemas/script.js';

export interface ScriptDocMeta {
  projectTitle: string;
  version: number;
  score?: string | null;
  generatedAt: string; // display string
}

/** The long-form scenes in order, with a display name (scene 8 has no narration). */
export function scenes(s: Script) {
  const lf = s.long_form_storyboard;
  return [
    ...SCENE_KEYS.map((k, i) => ({
      n: i + 1,
      name: SCENE_NAMES[i]!,
      ...lf[k],
      on_screen: lf[k].on_screen_text,
    })),
    {
      n: 7,
      name: SCENE_NAMES[6],
      ...lf.scene_7_cta,
      on_screen: lf.scene_7_cta.on_screen_text_progression,
      b_roll: '',
    },
  ];
}

function metaLine(meta: ScriptDocMeta) {
  return `${meta.projectTitle} · Version ${meta.version}${meta.score ? ` · Topic score ${meta.score}` : ''} · ${meta.generatedAt}`;
}

export function scriptMarkdown(s: Script, meta: ScriptDocMeta): string {
  const m = s.episode_metadata;
  const o = s.opening_examples;
  const yt = s.youtube_optimization;
  const L: string[] = [
    `# ${m.episode_title}`,
    '',
    metaLine(meta),
    '',
    `**Topic:** ${m.topic}  `,
    `**Shared value:** ${m.shared_value}`,
    '',
    '## Opening examples',
    '',
    `**A. ${o.example_a.perspective}.** ${o.example_a.story} ${o.example_a.shared_value_expression}`,
    '',
    `**B. ${o.example_b.perspective}.** ${o.example_b.story} ${o.example_b.shared_value_expression}`,
    '',
    o.connecting_statement,
    '',
    '## Long-form storyboard',
    '',
  ];
  for (const sc of scenes(s)) {
    L.push(`### Scene ${sc.n}. ${sc.name} (${sc.time_range})`, '', sc.narration, '');
    if (sc.on_screen.length) L.push(`- **On screen:** ${sc.on_screen.join(' / ')}`);
    if (sc.b_roll) L.push(`- **B-roll:** ${sc.b_roll}`);
    L.push(
      `- **Background:** ${sc.narrator_background}`,
      `- **Camera:** ${sc.camera}`,
      `- **Music:** ${sc.music}`,
      `- **Beat:** ${sc.emotional_beat}`,
      '',
    );
  }
  const outro = s.long_form_storyboard.scene_8_outro;
  L.push(
    `### Scene 8. ${SCENE_NAMES[7]} (${outro.time_range})`,
    '',
    `${outro.core_message}${outro.note ? ` (${outro.note})` : ''}`,
    '',
  );
  L.push('## Clip timestamps (Short 1–3)', '');
  for (const c of s.clip_timestamps)
    L.push(`- **Short ${c.clip_number}** ${c.timecode} (${c.scene_location}): "${c.hook_line}"`);
  L.push('', '## Short-form clips', '');
  for (const c of s.short_form_clips) {
    L.push(
      `### Clip ${c.clip_id}. ${c.title} (${c.duration}, ${c.emotional_tone})`,
      '',
      c.hook_content,
      '',
      `- **Platform tease:** ${c.platform_tease}`,
      `- **Visual:** ${c.visual}`,
      `- **Music:** ${c.music}`,
      '',
    );
  }
  L.push(
    '## YouTube',
    '',
    `**Title:** ${yt.title}`,
    '',
    yt.description,
    '',
    `**Tags:** ${yt.tags.join(', ')}  `,
    `**Hashtags:** ${yt.hashtags.join(' ')}  `,
    `**Thumbnail:** ${yt.thumbnail_concept}`,
    '',
    '## Closing reflection',
    '',
    s.closing_reflection,
    '',
    '## Transition notes',
    '',
    s.transition_notes,
  );
  return `${L.join('\n')}\n`;
}

// ---- Word

const border = { style: BorderStyle.SINGLE, size: 4, color: 'E2DED4' };
const borders = { top: border, bottom: border, left: border, right: border };

const p = (
  text: string,
  opts: { bold?: boolean; italics?: boolean; color?: string; size?: number } = {},
) =>
  new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text, size: 22, ...opts })] });
const h = (level: (typeof HeadingLevel)[keyof typeof HeadingLevel], text: string) =>
  new Paragraph({ heading: level, children: [new TextRun(text)] });
const labelled = (label: string, text: string) =>
  new Paragraph({
    spacing: { after: 60 },
    children: [
      new TextRun({ text: `${label}: `, bold: true, size: 20 }),
      new TextRun({ text, size: 20 }),
    ],
  });

function cell(text: string, bold = false, width?: number): TableCell {
  return new TableCell({
    borders,
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    children: [new Paragraph({ children: [new TextRun({ text, bold, size: 20 })] })],
  });
}

function table(header: string[], rows: string[][], widths: number[]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ tableHeader: true, children: header.map((x, i) => cell(x, true, widths[i])) }),
      ...rows.map((r) => new TableRow({ children: r.map((v, i) => cell(v, false, widths[i])) })),
    ],
  });
}

export async function scriptDocx(s: Script, meta: ScriptDocMeta): Promise<Uint8Array> {
  const m = s.episode_metadata;
  const o = s.opening_examples;
  const yt = s.youtube_optimization;
  const outro = s.long_form_storyboard.scene_8_outro;
  const children: Array<Paragraph | Table> = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(m.episode_title)] }),
    p(metaLine(meta), { color: '625E55', size: 20 }),
    labelled('Topic', m.topic),
    labelled('Shared value', m.shared_value),

    h(HeadingLevel.HEADING_1, 'Opening examples'),
    labelled(
      `A. ${o.example_a.perspective}`,
      `${o.example_a.story} ${o.example_a.shared_value_expression}`,
    ),
    labelled(
      `B. ${o.example_b.perspective}`,
      `${o.example_b.story} ${o.example_b.shared_value_expression}`,
    ),
    p(o.connecting_statement, { italics: true }),

    h(HeadingLevel.HEADING_1, 'Long-form storyboard'),
  ];
  for (const sc of scenes(s)) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [
          new TextRun(`Scene ${sc.n}. ${sc.name}  `),
          new TextRun({ text: sc.time_range, color: '625E55' }),
        ],
      }),
      ...sc.narration.split(/\n+/).map((x) => p(x, { size: 24 })),
    );
    if (sc.on_screen.length) children.push(labelled('On screen', sc.on_screen.join(' / ')));
    if (sc.b_roll) children.push(labelled('B-roll', sc.b_roll));
    children.push(
      labelled('Background', sc.narrator_background),
      labelled('Camera', sc.camera),
      labelled('Music', sc.music),
      labelled('Beat', sc.emotional_beat),
    );
  }
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [
        new TextRun(`Scene 8. ${SCENE_NAMES[7]}  `),
        new TextRun({ text: outro.time_range, color: '625E55' }),
      ],
    }),
    p(`${outro.core_message}${outro.note ? ` (${outro.note})` : ''}`, { italics: true }),

    h(HeadingLevel.HEADING_1, 'Clip timestamps (Short 1–3)'),
    table(
      ['Short', 'Timecode', 'Scene', 'Hook line'],
      s.clip_timestamps.map((c) => [
        `Short ${c.clip_number}`,
        c.timecode,
        c.scene_location,
        c.hook_line,
      ]),
      [12, 18, 15, 55],
    ),

    h(HeadingLevel.HEADING_1, 'Short-form clips'),
  );
  for (const c of s.short_form_clips) {
    children.push(
      h(
        HeadingLevel.HEADING_3,
        `Clip ${c.clip_id}. ${c.title} (${c.duration}, ${c.emotional_tone})`,
      ),
      p(c.hook_content),
      labelled('Platform tease', c.platform_tease),
      labelled('Visual', c.visual),
      labelled('Music', c.music),
    );
  }
  children.push(
    h(HeadingLevel.HEADING_1, 'YouTube'),
    labelled('Title', yt.title),
    p(yt.description),
    labelled('Tags', yt.tags.join(', ')),
    labelled('Hashtags', yt.hashtags.join(' ')),
    labelled('Thumbnail', yt.thumbnail_concept),

    h(HeadingLevel.HEADING_1, 'Narrator backgrounds'),
    table(
      ['Scene', 'Background', 'Lighting', 'Alignment'],
      s.narrator_backgrounds.map((b) => [
        b.scene,
        b.description,
        b.lighting,
        b.emotional_alignment,
      ]),
      [14, 46, 20, 20],
    ),

    h(HeadingLevel.HEADING_1, 'Closing reflection'),
    p(s.closing_reflection),
    h(HeadingLevel.HEADING_1, 'Transition notes'),
    p(s.transition_notes),
  );

  const doc = new Document({
    creator: 'TrueU Content Cockpit',
    title: m.episode_title,
    styles: { default: { document: { run: { font: 'Calibri' } } } },
    sections: [{ properties: {}, children }],
  });
  return new Uint8Array(await Packer.toBuffer(doc));
}
