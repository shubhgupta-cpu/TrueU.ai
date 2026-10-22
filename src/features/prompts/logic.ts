// Mirrors server/render.ts so the editor can flag problems before a Test run.

const PLACEHOLDER = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;
const ANY_PLACEHOLDER = /\{\{[^{}]*\}\}/g;

export function promptVariables(body: string): string[] {
  return [...new Set([...body.matchAll(PLACEHOLDER)].map((m) => m[1]!))];
}

/** Placeholders the app can't fill, e.g. n8n's {{ $json['All Topics'] }} or {{ $now }}. */
export function unsupportedPlaceholders(body: string): string[] {
  return [...new Set(body.replace(PLACEHOLDER, '').match(ANY_PLACEHOLDER) ?? [])];
}

export function isPlaceholderPrompt(body: string): boolean {
  return body.trimStart().startsWith('TODO:');
}

/** Variables each prompt key receives from the app (docs/prompts.md §2). brand_context is always available. */
export const PROMPT_VARIABLES: Record<string, string[]> = {
  topic_score: ['brand_context', 'topic', 'topic_json', 'current_date'],
  topic_regenerate: ['brand_context', 'topic', 'topic_json', 'prior_improvements', 'current_date'],
  topic_generate: [
    'brand_context',
    'count',
    'recent_titles',
    'saved_topics',
    'performance_notes',
    'current_date',
  ],
  trend_to_topic: ['brand_context', 'keyword', 'trend_items', 'current_date'],
};

/** Variables the body uses that the app never passes for this key: they'd fail at run time. */
export function unknownVariables(key: string, body: string): string[] {
  const known = PROMPT_VARIABLES[key];
  if (!known) return [];
  return promptVariables(body).filter((v) => !known.includes(v));
}
