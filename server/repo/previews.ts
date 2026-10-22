// What each platform post will look like: approved/draft captions + the editor's video.
import type { PostPreview } from '../../src/types/api.js';
import { and, eq, link, list, str, T } from '../airtable.js';
import { platformsFor } from '../publish-map.js';
import { toContentItem } from '../mappers.js';

const ROLE: Record<string, string> = {
  long_video: 'long_video',
  video_1: 'short_1',
  video_2: 'short_2',
  video_3: 'short_3',
};

export async function projectPreviews(projectId: string): Promise<PostPreview[]> {
  const [items, assets] = await Promise.all([
    list(T.contentItems, { filterByFormula: `{Status}!="superseded"` }),
    list(T.assets, { filterByFormula: eq('Current', true) }),
  ]);
  const videoOf = (role: string) =>
    assets.find((a) => link(a.fields, 'Project') === projectId && str(a.fields, 'Role') === role)
      ?.id ?? null;
  const out: PostPreview[] = [];
  for (const rec of items) {
    if (link(rec.fields, 'Project') !== projectId) continue;
    const it = toContentItem(rec);
    const role = ROLE[it.post ?? ''];
    if (!it.channel || !role) continue;
    for (const platform of platformsFor(it.channel, it.post!)) {
      out.push({
        key: `${rec.id}:${platform}`,
        platform,
        asset_role: role,
        title:
          it.channel === 'youtube' || it.channel === 'pinterest' ? str(rec.fields, 'Title') : null,
        caption: it.caption,
        hashtags: it.hashtags,
        status: it.status,
        video_id: videoOf(role),
      });
    }
  }
  return out;
}

export async function videoLinkTarget(assetId: string): Promise<string | null> {
  const [rec] = await list(T.assets, {
    filterByFormula: and(`RECORD_ID()="${assetId}"`, eq('Current', true)),
  });
  return rec ? (str(rec.fields, 'Dropbox File ID') ?? null) : null;
}
