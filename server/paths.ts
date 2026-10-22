// Pure Dropbox path rules (spec F5.2, integrations.md §3). The layout matches the team's existing
// folders: /Year - 2026/October 2026/<Topic name>/<subfolders>. Names come from settings.dropbox
// so they can change without code.

export interface FolderLayout {
  /** Parent of the year folders; '' = the top of the (team) Dropbox. */
  root: string;
  /** {YYYY} → year. */
  year_folder: string;
  /** {Month} → "October", {Mon} → "Oct", {MM} → "10", {YYYY} → year. */
  month_folder: string;
  subfolders: string[];
  /** Where script versions go (one of subfolders). */
  script_folder: string;
  /** Where the approved blog goes (one of subfolders). */
  blog_folder: string;
}

export const DEFAULT_LAYOUT: FolderLayout = {
  root: '',
  year_folder: 'Year - {YYYY}',
  month_folder: '{Month} {YYYY}',
  subfolders: [
    'B_Roll',
    'Backgrounds',
    'Bannerbear Images all Platforms',
    'Blog_Script',
    'Chat Reel Video',
    'Clips for Editor',
    'FINAL',
    'Graphics',
    'Long Youtube Final Video',
    'Podcast',
    'RAW',
    'Resize Video',
    'Script',
    'Short Final Video',
    'Thumbnail',
  ],
  script_folder: 'Script',
  blog_folder: 'Blog_Script',
};

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "Why entrepreneurs struggle?" → "Why-Entrepreneurs-Struggle" (project slug; ASCII). */
export function titleSlug(title: string, maxLength = 60): string {
  const words = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1));
  let out = '';
  for (const w of words) {
    const next = out ? `${out}-${w}` : w;
    if (next.length > maxLength) break;
    out = next;
  }
  return out || 'Untitled';
}

/** A topic title as a folder name: readable, minus characters Dropbox/Windows reject, ≤ 80 chars. */
export function topicFolderName(title: string, maxLength = 80): string {
  const clean = title
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  let out = clean;
  if (out.length > maxLength) {
    out = out.slice(0, maxLength);
    const cut = out.lastIndexOf(' ');
    if (cut > maxLength / 2) out = out.slice(0, cut);
  }
  return out.replace(/[ .]+$/, '') || 'Untitled';
}

function fill(template: string, year: number, month: number): string {
  return template
    .replace(/\{YYYY\}/g, String(year))
    .replace(/\{Month\}/g, MONTHS[month - 1]!)
    .replace(/\{Mon\}/g, MONTHS[month - 1]!.slice(0, 3))
    .replace(/\{MM\}/g, String(month).padStart(2, '0'));
}

/** `{root}/Year - YYYY/Month YYYY/<Topic name>` for cycle month "YYYY-MM-01". */
export function projectFolder(
  layout: FolderLayout,
  cycleMonth: string,
  topicTitle: string,
): string {
  const [year, month] = cycleMonth.split('-').map(Number) as [number, number];
  const root = layout.root.replace(/\/+$/, '');
  return `${root}/${fill(layout.year_folder, year, month)}/${fill(layout.month_folder, year, month)}/${topicFolderName(topicTitle)}`;
}

export function scriptFileName(version: number, ext: 'docx' | 'md'): string {
  return `script_v${version}.${ext}`;
}

export function blogFileName(ext: 'docx' | 'md'): string {
  return `blog_APPROVED.${ext}`;
}

export function approvedFileName(ext: 'docx' | 'md'): string {
  return `script_APPROVED.${ext}`;
}

/** Settings may hold an older or partial `dropbox` object: fill the gaps with the defaults. */
export function layoutFrom(setting: Partial<FolderLayout> | null | undefined): FolderLayout {
  const s = setting ?? {};
  return {
    root: typeof s.root === 'string' ? s.root : DEFAULT_LAYOUT.root,
    year_folder: s.year_folder || DEFAULT_LAYOUT.year_folder,
    month_folder: s.month_folder || DEFAULT_LAYOUT.month_folder,
    subfolders:
      Array.isArray(s.subfolders) && s.subfolders.length ? s.subfolders : DEFAULT_LAYOUT.subfolders,
    script_folder: s.script_folder || DEFAULT_LAYOUT.script_folder,
    blog_folder: s.blog_folder || DEFAULT_LAYOUT.blog_folder,
  };
}
