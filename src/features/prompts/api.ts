import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Prompt } from '@/types/api';

export type PromptRow = Prompt;

const promptsKey = ['prompts'] as const;

export function usePrompts() {
  return useQuery({ queryKey: promptsKey, queryFn: () => api<Prompt[]>('/prompts') });
}

export interface NewVersion {
  key: string;
  title: string;
  body: string;
  model: string | null;
  max_tokens: number | null;
  notes: string | null;
}

/** Every save is a new version (F15.1). It isn't used until it's activated. */
export function useSavePromptVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: NewVersion) => api<Prompt>('/prompts', { body: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: promptsKey }),
  });
}

export function useActivatePrompt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (promptId: string) => api(`/prompts/${promptId}/activate`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: promptsKey }),
  });
}

export function useSampleVariables(key: string | undefined) {
  return useQuery({
    queryKey: ['prompt-sample', key],
    enabled: !!key,
    staleTime: Infinity,
    queryFn: () =>
      api<{ variables: Record<string, unknown>; has_schema: boolean }>(
        `/prompts/sample?key=${encodeURIComponent(key!)}`,
      ),
  });
}

export interface TestRunResult {
  model: string;
  duration_ms: number;
  usage: { input_tokens: number; output_tokens: number };
  rendered_prompt: string;
  raw: string;
  valid: boolean;
  errors: string | null;
  warnings: string[];
  schema_checked: boolean;
}

export function useTestRun() {
  return useMutation({
    mutationFn: (input: {
      key: string;
      body?: string;
      model?: string;
      variables?: Record<string, unknown>;
    }) => api<TestRunResult>('/prompts/test-run', { body: input }),
  });
}
