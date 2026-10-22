// Pure prompt rendering (docs/prompts.md §1). No I/O.

const PLACEHOLDER = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;
const ANY_PLACEHOLDER = /\{\{[^{}]*\}\}/;

export class PromptRenderError extends Error {}

function renderValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value, null, 2);
}

/** Variable names a prompt body references, in order of first use. */
export function promptVariables(body: string): string[] {
  return [...new Set([...body.matchAll(PLACEHOLDER)].map((m) => m[1]!))];
}

/**
 * Replaces {{name}} with values (objects/arrays as pretty JSON). Throws when a referenced variable
 * is missing, or when a placeholder the app can't fill is left behind — e.g. n8n's
 * {{ $json['All Topics'] }} pasted from the old workflow.
 */
export function renderPrompt(body: string, vars: Record<string, unknown>): string {
  const missing = promptVariables(body).filter((name) => !(name in vars));
  if (missing.length) {
    throw new PromptRenderError(`Missing prompt variable(s): ${missing.join(', ')}`);
  }
  const rendered = body.replace(PLACEHOLDER, (_m, name: string) => renderValue(vars[name]));
  const leftover = body.replace(PLACEHOLDER, '').match(ANY_PLACEHOLDER);
  if (leftover) {
    throw new PromptRenderError(
      `Unsupported placeholder ${leftover[0]} — use {{variable_name}} (see docs/prompts.md)`,
    );
  }
  return rendered;
}

export function outputContract(jsonSchema: unknown): string {
  return (
    'Return ONLY valid JSON matching this schema. No prose, no code fences.\n' +
    JSON.stringify(jsonSchema)
  );
}

/**
 * The first complete JSON object/array in the text (string-aware bracket matching), or null.
 * Lets a reply with stray prose or a trailing extra "}" still parse; the schema checks the rest.
 */
export function firstJsonValue(text: string): string | null {
  const start = text.search(/[{[]/);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/** Pulls the JSON value out of a model reply, tolerating code fences, stray prose or a stray brace. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenced ? fenced[1]! : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const value = firstJsonValue(candidate);
    if (value) return JSON.parse(value);
    throw new SyntaxError('Response is not valid JSON');
  }
}
