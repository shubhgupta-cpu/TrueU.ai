import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, POLL_BUSY_MS, POLL_IDLE_MS } from '@/lib/api';
import type { Project, ProjectDetail, SocialChannel } from '@/types/api';

const projectsKey = ['projects'] as const;
const projectKey = (id: string) => ['projects', id] as const;

export function useProjects() {
  return useQuery({
    queryKey: projectsKey,
    queryFn: () => api<Project[]>('/projects'),
    refetchInterval: POLL_IDLE_MS,
  });
}

const busy = (p: ProjectDetail | undefined) =>
  !!p?.jobs.some((j) => j.status === 'queued' || j.status === 'running');

export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: projectKey(id ?? ''),
    enabled: !!id,
    queryFn: () => api<ProjectDetail>(`/projects/${id}`),
    refetchInterval: (q) => (busy(q.state.data) ? POLL_BUSY_MS : POLL_IDLE_MS),
  });
}

function useProjectAction<V>(id: string, fn: (v: V) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKey(id) }),
  });
}

type Group = 'captions' | 'youtube' | 'ctas' | 'polls';
const GROUPS: Group[] = ['captions', 'youtube', 'ctas', 'polls'];
type Item = ProjectDetail['captions']['items'][number];

/**
 * Updates the screen at once (the post flips to approved / rejected as soon as it is clicked) and
 * restores it if the server refuses. The real data is fetched again afterwards either way.
 */
function useOptimisticAction<V>(
  id: string,
  fn: (v: V) => Promise<unknown>,
  patch: (detail: ProjectDetail, v: V) => ProjectDetail,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onMutate: async (v: V) => {
      await qc.cancelQueries({ queryKey: projectKey(id) });
      const before = qc.getQueryData<ProjectDetail>(projectKey(id));
      if (before) qc.setQueryData(projectKey(id), patch(before, v));
      return { before };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.before) qc.setQueryData(projectKey(id), ctx.before);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: projectKey(id) }),
  });
}

/** The detail with `change` applied to the items that `match` picks, in every post group. */
function patchItems(
  d: ProjectDetail,
  match: (item: Item, group: Group) => boolean,
  change: (item: Item) => Item,
): ProjectDetail {
  const next = { ...d };
  for (const g of GROUPS)
    next[g] = { ...d[g], items: d[g].items.map((i) => (match(i, g) ? change(i) : i)) };
  return next;
}

/** Re-runs the Dropbox setup (folders + shared link); also exports scripts not yet in Dropbox. */
export function useRetrySetup(id: string) {
  return useProjectAction<void>(id, () => api(`/projects/${id}/setup`, { method: 'POST' }));
}

export function useSetVideosFolder(id: string) {
  return useProjectAction<string>(id, (path) =>
    api(`/projects/${id}/videos-folder`, { method: 'PATCH', body: { path } }),
  );
}

export function useScanVideos(id: string) {
  return useProjectAction<void>(id, () => api(`/projects/${id}/scan`, { method: 'POST' }));
}

/** A new script version, optionally guided by notes (F6.3). */
export function useRegenerateScript(id: string) {
  return useProjectAction(id, (notes: string) =>
    api(`/projects/${id}/script`, { body: notes.trim() ? { notes } : {} }),
  );
}

/** In-app approval of the newest script version (F7.5). */
export function useApproveScript(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (versionId: string) => api(`/scripts/${versionId}/approve`, { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: projectKey(projectId) });
      void qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

/** Blog (F9): regenerate with optional notes, approve (→ Dropbox Blog_Script), or reject. */
export function useRegenerateBlog(projectId: string) {
  return useProjectAction(projectId, (notes: string) =>
    api(`/projects/${projectId}/blog`, { body: notes.trim() ? { notes } : {} }),
  );
}

export function useApproveBlog(projectId: string) {
  return useProjectAction(projectId, (versionId: string) =>
    api(`/blogs/${versionId}/approve`, { method: 'POST' }),
  );
}

export function useRejectBlog(projectId: string) {
  return useProjectAction(projectId, ({ versionId, notes }: { versionId: string; notes: string }) =>
    api(`/blogs/${versionId}/reject`, { body: notes.trim() ? { notes } : {} }),
  );
}

/** Social captions (F10): regenerate all or one channel; approve/reject posts; approve all. */
export function useRegenerateCaptions(projectId: string) {
  return useProjectAction(
    projectId,
    ({ notes, channel }: { notes: string; channel?: SocialChannel }) =>
      api(`/projects/${projectId}/captions`, {
        body: { ...(notes.trim() ? { notes } : {}), ...(channel ? { channel } : {}) },
      }),
  );
}

/** YouTube metadata (F10.1): all four videos, or one ('long_video' | 'video_1..3'). */
export function useRegenerateYouTube(projectId: string) {
  return useProjectAction(projectId, ({ notes, video }: { notes: string; video?: string }) =>
    api(`/projects/${projectId}/youtube`, {
      body: { ...(notes.trim() ? { notes } : {}), ...(video ? { video } : {}) },
    }),
  );
}

/** CTAs & hooks / polls: regenerate the whole set with optional notes. */
export function useRegenerateExtras(projectId: string, kind: 'ctas' | 'polls') {
  return useProjectAction(projectId, (notes: string) =>
    api(`/projects/${projectId}/${kind}`, { body: notes.trim() ? { notes } : {} }),
  );
}

/** A poll's "posted on" platforms and results notes. */
export function useUpdatePoll(projectId: string) {
  return useProjectAction(
    projectId,
    ({
      itemId,
      ...body
    }: {
      itemId: string;
      posted_on?: string[];
      results_notes?: string | null;
    }) => api(`/content-items/${itemId}/poll`, { method: 'PATCH', body }),
  );
}

export function useApproveItem(projectId: string) {
  return useOptimisticAction(
    projectId,
    (itemId: string) => api(`/content-items/${itemId}/approve`, { method: 'POST' }),
    (d, itemId) =>
      patchItems(
        d,
        (i) => i.id === itemId,
        (i) => ({ ...i, status: 'approved' }),
      ),
  );
}

export function useRejectItem(projectId: string) {
  return useOptimisticAction(
    projectId,
    ({ itemId, notes }: { itemId: string; notes: string }) =>
      api(`/content-items/${itemId}/reject`, { body: notes.trim() ? { notes } : {} }),
    (d, { itemId, notes }) =>
      patchItems(
        d,
        (i) => i.id === itemId,
        (i) => ({ ...i, status: 'rejected', review_notes: notes.trim() || null }),
      ),
  );
}

export function useApproveAllCaptions(projectId: string) {
  return useOptimisticAction(
    projectId,
    (setId: string) =>
      api<{ approved: number }>(`/caption-sets/${setId}/approve-all`, { method: 'POST' }),
    (d, setId) =>
      patchItems(
        d,
        (i, g) => d[g].set?.id === setId && (i.status === 'draft' || i.status === 'needs_edit'),
        (i) => ({ ...i, status: 'approved' }),
      ),
  );
}

export function useExportScript(projectId: string) {
  return useProjectAction(projectId, (versionId: string) =>
    api(`/scripts/${versionId}/export`, { method: 'POST' }),
  );
}
