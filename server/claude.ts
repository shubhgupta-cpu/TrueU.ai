// runPrompt(key, vars, schema): load the active prompt → render {{vars}} → append the output
// contract → call Claude → parse + zod-validate → retry once with the errors → log usage.
// (docs/prompts.md, CLAUDE.md rules 5, 6, 13, 14)
import { memo } from './cache.js';
import Anthropic from '@anthropic-ai/sdk';
import type { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { and, eq, first, num, str, T } from './airtable.js';
import { isMock, requireEnv } from './env.js';
import { claudeFixtures } from './fixtures/index.js';
import { PermanentJobError } from './jobs/rules.js';
import { usage } from './log.js';
import {
  extractJson,
  outputContract,
  promptVariables,
  PromptRenderError,
  renderPrompt,
} from './render.js';
import { getSettings } from './settings.js';

export interface PromptRow {
  id: string | null;
  key: string;
  version: number;
  body: string;
  model: string | null;
  max_tokens: number | null;
}

export interface PromptContext {
  jobId?: string | null;
  projectId?: string | null;
}

/** Unsaved overrides from the Prompt manager's "Test run". */
export interface PromptOverrides {
  body?: string;
  model?: string;
}

export interface RunPromptResult<T> {
  data: T;
  raw: string;
  prompt: { key: string; version: number };
  model: string;
  attempts: number;
}

/** Prompts that use settings.models.fast when the prompt row names no model (integrations.md §1). */
const FAST_PROMPTS = new Set(['trend_to_topic', 'quick_rewrite']);

/** USD per million tokens [input, output]. Unknown models log tokens without a cost. */
const PRICING: Record<string, [number, number]> = {
  'claude-fable-5-1': [10, 50],
  'claude-opus-5-5': [4, 20],
  'claude-opus-5': [5, 25],
  'claude-sonnet-5-5': [2, 10],
  'claude-sonnet-5': [2, 10],
  'claude-haiku-5-5': [0.1, 0.5],
  'claude-haiku-4-5': [1, 5],
};

/** Models that accept the server-side refusal fallback (`fallbacks: "default"`). */
const FALLBACK_MODELS = new Set([
  'claude-fable-5-1',
  'claude-opus-5-5',
  'claude-opus-5',
  'claude-sonnet-5-5',
]);

const DEFAULT_MAX_TOKENS = 16_000;
const TIMEOUT_MS = 240_000;

/** `inputTokens` are the uncached ones; cache writes cost 1.25× and cache reads 0.1× the input price. */
export function costUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheWriteTokens = 0,
  cacheReadTokens = 0,
): number | undefined {
  const price = PRICING[model];
  if (!price) return undefined;
  return (
    (inputTokens * price[0] +
      cacheWriteTokens * price[0] * 1.25 +
      cacheReadTokens * price[0] * 0.1 +
      outputTokens * price[1]) /
    1_000_000
  );
}

/** The active version of a prompt key, from the Airtable "Prompts" table. */
export function loadActivePrompt(key: string): Promise<PromptRow> {
  return memo(`prompt:${key}`, 20_000, () => readActivePrompt(key));
}

async function readActivePrompt(key: string): Promise<PromptRow> {
  const rec = await first(T.prompts, {
    filterByFormula: and(eq('Key', key), eq('Active', true)),
    sort: [{ field: 'Version', direction: 'desc' }],
  });
  if (!rec) throw new PermanentJobError(`Prompt ${key} has no active version`);
  return {
    id: rec.id,
    key,
    version: num(rec.fields, 'Version') ?? 1,
    body: (rec.fields['Body'] as string | undefined) ?? '',
    model: str(rec.fields, 'Model'),
    max_tokens: num(rec.fields, 'Max Tokens'),
  };
}

export function isPlaceholderPrompt(body: string): boolean {
  return body.trimStart().startsWith('TODO:');
}

export type Validation<T> = { ok: true; data: T } | { ok: false; error: string };

/** Parses a reply as JSON and validates it. Errors are short and readable for the retry message. */
export function validateOutput<S extends z.ZodTypeAny>(
  text: string,
  schema: S,
): Validation<z.infer<S>> {
  let json: unknown;
  try {
    json = extractJson(text);
  } catch {
    return { ok: false, error: 'The response was not valid JSON.' };
  }
  const result = schema.safeParse(json);
  if (result.success) return { ok: true, data: result.data };
  const issues = result.error.issues
    .slice(0, 15)
    .map((i: z.ZodIssue) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('; ');
  return { ok: false, error: issues };
}

type Message = { role: 'user' | 'assistant'; content: string | unknown[] };

interface Completion {
  text: string;
  content: unknown[];
  model: string;
  /** Uncached input tokens. */
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
}

let client: Anthropic | undefined;
function anthropic() {
  client ??= new Anthropic({
    apiKey: requireEnv('ANTHROPIC_API_KEY'),
    timeout: TIMEOUT_MS,
    maxRetries: 2, // SDK retries 408/409/429/5xx and connection errors → 3 attempts in total
  });
  return client;
}

async function complete(
  model: string,
  maxTokens: number,
  messages: Message[],
): Promise<Completion> {
  const params: Record<string, unknown> = { model, max_tokens: maxTokens, messages };
  if (FALLBACK_MODELS.has(model)) {
    // On a safety-classifier refusal the API re-runs the request on a suitable model.
    params.betas = ['server-side-fallback-2026-07-01'];
    params.fallbacks = 'default';
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res: any = await anthropic().beta.messages.create(params as any);

  if (res.stop_reason === 'refusal') {
    const category = res.stop_details?.category ?? 'unspecified';
    throw new PermanentJobError(`Claude declined this request (refusal: ${category})`);
  }
  if (res.stop_reason === 'max_tokens') {
    throw new PermanentJobError(
      `Claude's reply was cut off at max_tokens (${maxTokens}). Raise max_tokens for this prompt.`,
    );
  }
  const text = (res.content as Array<{ type: string; text?: string }>)
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('');
  return {
    text,
    content: res.content,
    model: res.model,
    inputTokens: res.usage?.input_tokens ?? 0,
    outputTokens: res.usage?.output_tokens ?? 0,
    cacheWriteTokens: res.usage?.cache_creation_input_tokens ?? 0,
    cacheReadTokens: res.usage?.cache_read_input_tokens ?? 0,
  };
}

/** Deterministic variant pick so a given topic always gets the same mock score. */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function mockComplete(key: string, vars: Record<string, unknown>): Completion {
  const variants = claudeFixtures[key];
  if (!variants?.length)
    throw new Error(`No mock fixture for prompt ${key} (server/fixtures/claude)`);
  const stable = { ...vars };
  delete stable.current_date;
  delete stable.brand_context;
  const pick = variants[hash(JSON.stringify(stable)) % variants.length];
  const text = JSON.stringify(pick);
  return {
    text,
    content: [{ type: 'text', text }],
    model: 'mock',
    inputTokens: 0,
    outputTokens: 0,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
  };
}

/**
 * Prompt caching: the client's prompt text comes before the first {{variable}}, so it is identical on every
 * run of the same prompt. Marking it cacheable makes repeat runs (4 YouTube runs, regenerations, retries)
 * read it from Anthropic's cache: cheaper and faster. Found by rendering twice with different variable
 * values and keeping what both renders share. Too-short prefixes are not cached by the API; harmless.
 */
export function cacheableBlocks(body: string, content: string, brandContext: unknown): unknown[] {
  const names = promptVariables(body).filter((n) => n !== 'brand_context');
  const render = (v: string) =>
    renderPrompt(body, {
      brand_context: brandContext,
      ...Object.fromEntries(names.map((n) => [n, v])),
    });
  let cut = 0;
  try {
    const a = render('A');
    const b = render('B');
    while (cut < a.length && a[cut] === b[cut]) cut++;
  } catch {
    cut = 0;
  }
  if (cut < 1500 || cut >= content.length) return [{ type: 'text', text: content }];
  return [
    { type: 'text', text: content.slice(0, cut), cache_control: { type: 'ephemeral' } },
    { type: 'text', text: content.slice(cut) },
  ];
}

export interface PreparedPrompt {
  prompt: PromptRow;
  model: string;
  maxTokens: number;
  content: string;
  /** The same text as blocks: the part before the first variable is marked cacheable (prompt caching). */
  blocks: unknown[];
}

/** Loads (or overrides), guards and renders a prompt. Throws PermanentJobError on config problems. */
export async function preparePrompt(
  key: string,
  vars: Record<string, unknown>,
  schema: z.ZodTypeAny | null,
  overrides: PromptOverrides = {},
): Promise<PreparedPrompt> {
  const active = await loadActivePrompt(key);
  const prompt: PromptRow =
    overrides.body !== undefined ? { ...active, id: null, body: overrides.body } : active;

  // Mock mode runs on fixtures, so it works before the client's prompts are pasted in.
  if (!isMock() && isPlaceholderPrompt(prompt.body)) {
    throw new PermanentJobError(`Prompt ${key} not configured`);
  }

  const { models, brand_context } = await getSettings(['models', 'brand_context'] as const);
  let rendered: string;
  try {
    rendered = renderPrompt(prompt.body, { brand_context, ...vars });
  } catch (err) {
    if (err instanceof PromptRenderError)
      throw new PermanentJobError(`Prompt ${key}: ${err.message}`);
    throw err;
  }
  const content = schema
    ? `${rendered}\n\n${outputContract(zodToJsonSchema(schema as never, { $refStrategy: 'none' }))}`
    : rendered;
  const model =
    overrides.model ?? prompt.model ?? (FAST_PROMPTS.has(key) ? models.fast : models.default);
  return {
    prompt,
    model,
    maxTokens: prompt.max_tokens ?? DEFAULT_MAX_TOKENS,
    content,
    blocks: cacheableBlocks(prompt.body, content, brand_context),
  };
}

/** One call, no validation retry. Used by runPrompt and by the Prompt manager's Test run. */
export async function callPrompt(
  key: string,
  vars: Record<string, unknown>,
  prepared: PreparedPrompt,
  ctx: PromptContext,
  messages: Message[] = [{ role: 'user', content: prepared.blocks }],
): Promise<Completion> {
  if (isMock()) return mockComplete(key, vars);
  const started = Date.now();
  const res = await complete(prepared.model, prepared.maxTokens, messages);
  await usage({
    provider: 'anthropic',
    model: res.model,
    jobId: ctx.jobId,
    projectId: ctx.projectId,
    promptKey: key,
    // The usage log shows total input; the cost counts cache reads and writes at their own prices.
    inputTokens: res.inputTokens + res.cacheWriteTokens + res.cacheReadTokens,
    outputTokens: res.outputTokens,
    costUsd: costUsd(
      res.model,
      res.inputTokens,
      res.outputTokens,
      res.cacheWriteTokens,
      res.cacheReadTokens,
    ),
    durationMs: Date.now() - started,
  });
  return res;
}

export async function runPrompt<S extends z.ZodTypeAny>(
  key: string,
  vars: Record<string, unknown>,
  schema: S,
  ctx: PromptContext = {},
): Promise<RunPromptResult<z.infer<S>>> {
  const prepared = await preparePrompt(key, vars, schema);
  const messages: Message[] = [{ role: 'user', content: prepared.blocks }];

  let res = await callPrompt(key, vars, prepared, ctx, messages);
  let check = validateOutput(res.text, schema);
  let attempts = 1;

  if (!check.ok) {
    messages.push(
      { role: 'assistant', content: res.content },
      {
        role: 'user',
        content: `Your previous output failed validation: ${check.error}. Return corrected JSON only.`,
      },
    );
    res = await callPrompt(key, vars, prepared, ctx, messages);
    check = validateOutput(res.text, schema);
    attempts = 2;
  }
  if (!check.ok) {
    throw new PermanentJobError(`Claude returned invalid output for ${key} twice: ${check.error}`);
  }
  return {
    data: check.data,
    raw: res.text,
    prompt: { key, version: prepared.prompt.version },
    model: res.model,
    attempts,
  };
}
