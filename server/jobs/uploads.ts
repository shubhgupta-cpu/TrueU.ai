// Finds the editor's videos in the topic's Dropbox folders and records them as Assets
// (identified by Dropbox file ID + rev, never by path: rule 10).
import { create, eq, link, list, nowIso, str, T, updateOne } from '../airtable.js';
import { listFiles } from '../dropbox.js';
import { activity } from '../log.js';
import { isVideoFile, shortNumber } from '../publish-map.js';
import { getSettings } from '../settings.js';
import type { JobHandler } from './handlers.js';

export const LONG_FOLDER = 'Long Youtube Final Video';
export const SHORT_FOLDER = 'Short Final Video';

export interface Found {
  id: string;
  rev: string;
  name: string;
  path: string;
  size: number;
  role: string;
}

/** One current file per role; a file whose short number can't be read has role "other". */
export function classify(
  long: Array<Omit<Found, 'role'>>,
  shorts: Array<Omit<Found, 'role'>>,
): Found[] {
  const out: Found[] = [];
  const newest = long.filter((f) => isVideoFile(f.name)).at(-1);
  if (newest) out.push({ ...newest, role: 'long_video' });
  for (const f of shorts.filter((f) => isVideoFile(f.name))) {
    const n = shortNumber(f.name);
    out.push({ ...f, role: n ? `short_${n}` : 'other' });
  }
  return out;
}

export async function scanProject(
  projectId: string,
  folder: string,
  settleMinutes: number,
): Promise<number> {
  const [long, shorts, known] = await Promise.all([
    listFiles(`${folder}/${LONG_FOLDER}`),
    listFiles(`${folder}/${SHORT_FOLDER}`),
    list(T.assets, { filterByFormula: eq('Current', true) }),
  ]);
  const mine = known.filter((r) => link(r.fields, 'Project') === projectId);
  const now = nowIso();
  let changed = 0;
  for (const f of classify(long, shorts)) {
    const same = mine.find(
      (r) => str(r.fields, 'Dropbox File ID') === f.id && str(r.fields, 'Dropbox Rev') === f.rev,
    );
    if (same) {
      const age = Date.now() - Date.parse(str(same.fields, 'Detected At') ?? now);
      if (!str(same.fields, 'Settled At') && age >= settleMinutes * 60_000) {
        await updateOne(T.assets, same.id, { 'Settled At': now, Updated: now });
        changed++;
      }
      continue;
    }
    // A new file or a new revision replaces the current one for that role (the old row is kept, not current).
    for (const old of mine.filter(
      (r) => str(r.fields, 'Role') === f.role && f.role !== 'other' && r.fields['Current'],
    )) {
      await updateOne(T.assets, old.id, { Current: false, Updated: now });
    }
    await create(T.assets, [
      {
        'File Name': f.name,
        Role: f.role,
        'Dropbox File ID': f.id,
        'Dropbox Path': f.path,
        'Dropbox Rev': f.rev,
        'Size Bytes': f.size,
        Project: [projectId],
        Current: true,
        'Detected At': now,
        Created: now,
        Updated: now,
      },
    ]);
    await activity({ event: 'video_detected', projectId, details: { file: f.name, role: f.role } });
    changed++;
  }
  return changed;
}

export const scanUploads: JobHandler = {
  async run() {
    const { dropbox } = await getSettings(['dropbox'] as const);
    const projects = await list(T.projects, { filterByFormula: `{Dropbox Folder Path}!=""` });
    let changed = 0;
    for (const p of projects) {
      const folder = str(p.fields, 'Videos Folder Path') ?? str(p.fields, 'Dropbox Folder Path');
      if (folder) changed += await scanProject(p.id, folder, dropbox.settle_minutes ?? 5);
    }
    return { projects: projects.length, changed };
  },
};
