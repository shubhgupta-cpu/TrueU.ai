import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, POLL_BUSY_MS, POLL_IDLE_MS } from '@/lib/api';
import type { Job, Topic, TopicScore } from '@/types/api';
import type { SubmitTopicValues } from './schema';

export type { Topic };

const topicsKey = ['topics'] as const;
const scoresKey = (topicId: string) => ['topic-scores', topicId] as const;

const busy = (topics: Topic[] | undefined) =>
  !!topics?.some((t) => t.status === 'new' || t.status === 'scoring' || t.regenerating);

/** All topics (the Inbox filters client-side; spec targets ≤ 500). Polls faster while scoring runs. */
export function useTopics() {
  return useQuery({
    queryKey: topicsKey,
    queryFn: () => api<Topic[]>('/topics'),
    refetchInterval: (q) => (busy(q.state.data) ? POLL_BUSY_MS : POLL_IDLE_MS),
  });
}

/** Every score for one topic, newest first (F3.4 history). Refreshes when the topic's score changes. */
export function useTopicScores(topicId: string | undefined, latestScoreId?: string | null) {
  return useQuery({
    queryKey: [...scoresKey(topicId ?? ''), latestScoreId ?? null],
    enabled: !!topicId,
    queryFn: () => api<TopicScore[]>(`/topics/${topicId}/scores`),
  });
}

export function useSubmitTopic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (values: SubmitTopicValues) =>
      api<{ id: string; topic_number: number; duplicate_of: string | null }>('/topics', {
        body: {
          title: values.title,
          description: values.description || null,
          category: values.category || null,
          notes: values.notes || null,
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: topicsKey }),
  });
}

export function useSetTopicStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'saved' | 'rejected' }) =>
      api(`/topics/${id}/status`, { body: { status } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: topicsKey }),
  });
}

/** Select → creates the project, its Dropbox folder and the first script (F4.4, F5). */
export function useSelectTopic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<{ project_id: string }>(`/topics/${id}/select`, { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: topicsKey });
      void qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useUpdateTopic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...fields
    }: {
      id: string;
      title?: string;
      description?: string | null;
      owner_notes?: string | null;
    }) => api(`/topics/${id}`, { method: 'PATCH', body: fields }),
    onSuccess: () => qc.invalidateQueries({ queryKey: topicsKey }),
  });
}

export function useRescoreTopic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (topicId: string) => api(`/topics/${topicId}/rescore`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: topicsKey }),
  });
}

/** Rewrites a below-threshold topic from its latest score's suggestions; the result is a new topic. */
export function useRegenerateTopic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (topicId: string) => api(`/topics/${topicId}/regenerate`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: topicsKey }),
  });
}

/** Latest "Generate with Claude" / "Pull trends" runs (status, result or error). */
export function useTopicJobs() {
  return useQuery({
    queryKey: ['topics', 'jobs'],
    queryFn: () => api<{ generate_topics: Job | null; pull_trends: Job | null }>('/topics/jobs'),
    refetchInterval: (q) =>
      [q.state.data?.generate_topics, q.state.data?.pull_trends].some(
        (j) => j?.status === 'queued' || j?.status === 'running',
      )
        ? POLL_BUSY_MS
        : POLL_IDLE_MS,
  });
}

/** Deletes the topic and everything generated for it in the app (not the Dropbox files). */
export function useDeleteTopic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<{ projects: number; content_items: number; dropbox_folders_kept: string[] }>(
        `/topics/${id}`,
        { method: 'DELETE' },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: topicsKey });
      void qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useGenerateTopics() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api('/topics/generate', { method: 'POST' }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['topics', 'jobs'] }),
  });
}

export function usePullTrends() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api('/topics/trends', { method: 'POST' }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['topics', 'jobs'] }),
  });
}
