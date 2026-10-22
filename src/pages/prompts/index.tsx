import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/status-badge';
import { Textarea } from '@/components/ui/textarea';
import {
  type PromptRow,
  useActivatePrompt,
  usePrompts,
  useSavePromptVersion,
} from '@/features/prompts/api';
import { TestRunPanel } from '@/features/prompts/components/test-run-panel';
import {
  isPlaceholderPrompt,
  PROMPT_VARIABLES,
  promptVariables,
  unknownVariables,
  unsupportedPlaceholders,
} from '@/features/prompts/logic';
import { cn } from '@/lib/utils';

export default function PromptsPage() {
  const prompts = usePrompts();
  const [params, setParams] = useSearchParams();

  const byKey = useMemo(() => {
    const map = new Map<string, PromptRow[]>();
    for (const p of prompts.data ?? []) map.set(p.key, [...(map.get(p.key) ?? []), p]);
    return map;
  }, [prompts.data]);
  const keys = [...byKey.keys()];
  const key = params.get('key') ?? keys[0];
  const versions = key ? (byKey.get(key) ?? []) : [];

  return (
    <>
      <PageHeader
        title="Prompts"
        description="Every save creates a new version. Jobs use the active version of each key."
      />
      {prompts.error && (
        <p role="alert" className="mt-6 text-sm text-danger">
          Couldn’t load prompts: {prompts.error.message}
        </p>
      )}
      <div className="mt-6 grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <nav aria-label="Prompt keys">
          <ul className="space-y-1">
            {keys.map((k) => {
              const active = byKey.get(k)!.find((p) => p.is_active);
              return (
                <li key={k}>
                  <button
                    type="button"
                    onClick={() => setParams({ key: k })}
                    aria-current={k === key ? 'page' : undefined}
                    className={cn(
                      'flex min-h-touch w-full flex-col items-start rounded-md px-3 py-2 text-left hover:bg-surface',
                      k === key && 'bg-surface ring-1 ring-line',
                    )}
                  >
                    <span className="font-mono text-sm">{k}</span>
                    <span className="mt-1 flex gap-1.5">
                      {active ? (
                        <span className="font-mono text-xs text-muted">
                          v{active.version} active
                        </span>
                      ) : (
                        <span className="text-xs text-danger">No active version</span>
                      )}
                      {active && isPlaceholderPrompt(active.body) && (
                        <StatusBadge meta={{ label: 'Not configured', tone: 'warning' }} />
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
        {key && versions.length > 0 && (
          <PromptEditor key={key} promptKey={key} versions={versions} />
        )}
      </div>
    </>
  );
}

function PromptEditor({ promptKey, versions }: { promptKey: string; versions: PromptRow[] }) {
  const save = useSavePromptVersion();
  const activate = useActivatePrompt();
  const active = versions.find((v) => v.is_active) ?? versions[0]!;
  const [viewId, setViewId] = useState(active.id);
  const viewing = versions.find((v) => v.id === viewId) ?? active;

  const [title, setTitle] = useState(viewing.title);
  const [body, setBody] = useState(viewing.body);
  const [model, setModel] = useState(viewing.model ?? '');
  const [maxTokens, setMaxTokens] = useState(viewing.max_tokens?.toString() ?? '');
  const [notes, setNotes] = useState(viewing.notes ?? '');
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    setTitle(viewing.title);
    setBody(viewing.body);
    setModel(viewing.model ?? '');
    setMaxTokens(viewing.max_tokens?.toString() ?? '');
    setNotes(viewing.notes ?? '');
  }, [viewing]);

  const dirty =
    title !== viewing.title ||
    body !== viewing.body ||
    model !== (viewing.model ?? '') ||
    maxTokens !== (viewing.max_tokens?.toString() ?? '') ||
    notes !== (viewing.notes ?? '');
  const unsupported = unsupportedPlaceholders(body);
  const unknown = unknownVariables(promptKey, body);
  const used = promptVariables(body);

  const onSave = async () => {
    setMessage(null);
    const tokens = maxTokens.trim() ? Number(maxTokens) : null;
    if (tokens !== null && (!Number.isInteger(tokens) || tokens < 1)) {
      setMessage({ tone: 'error', text: 'Max tokens must be a whole number.' });
      return;
    }
    try {
      const created = await save.mutateAsync({
        key: promptKey,
        title: title.trim() || promptKey,
        body,
        model: model.trim() || null,
        max_tokens: tokens,
        notes: notes.trim() || null,
      });
      setViewId(created.id);
      setMessage({
        tone: 'ok',
        text: `Saved as v${created.version}. Activate it to use it in jobs.`,
      });
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Couldn’t save.' });
    }
  };

  const onActivate = async () => {
    setMessage(null);
    try {
      await activate.mutateAsync(viewing.id);
      setMessage({ tone: 'ok', text: `v${viewing.version} is now active.` });
    } catch (err) {
      setMessage({
        tone: 'error',
        text: err instanceof Error ? err.message : 'Couldn’t activate.',
      });
    }
  };

  return (
    <div className="space-y-6">
      <section
        className="space-y-4 rounded-lg border border-line bg-surface p-6"
        aria-labelledby="editor-heading"
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="editor-heading" className="font-mono text-lg">
              {promptKey}
            </h2>
            <p className="text-xs text-muted">
              Variables the app passes:{' '}
              <span className="font-mono">
                {(PROMPT_VARIABLES[promptKey] ?? ['brand_context'])
                  .map((v) => `{{${v}}}`)
                  .join(' ')}
              </span>
            </p>
          </div>
          <div className="w-48 space-y-1">
            <Label htmlFor="version">Version</Label>
            <Select id="version" value={viewing.id} onChange={(e) => setViewId(e.target.value)}>
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  v{v.version}
                  {v.is_active ? ' (active)' : ''}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-[1fr_200px_140px]">
          <div className="space-y-1.5">
            <Label htmlFor="p-title">Title</Label>
            <Input id="p-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-model">Model</Label>
            <Input
              id="p-model"
              placeholder="settings default"
              className="font-mono"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-max">Max tokens</Label>
            <Input
              id="p-max"
              inputMode="numeric"
              placeholder="16000"
              className="font-mono"
              value={maxTokens}
              onChange={(e) => setMaxTokens(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between">
            <Label htmlFor="p-body">Prompt</Label>
            <span className="font-mono text-xs text-muted">
              {body.length.toLocaleString()} chars
            </span>
          </div>
          <Textarea
            id="p-body"
            className="min-h-[420px] font-mono text-xs leading-relaxed"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            aria-describedby="p-body-help"
          />
          <p id="p-body-help" className="text-xs text-muted">
            Uses:{' '}
            {used.length ? (
              <span className="font-mono">{used.map((v) => `{{${v}}}`).join(' ')}</span>
            ) : (
              'no variables'
            )}
            . The app appends the JSON output contract after this text.
          </p>
        </div>

        {unsupported.length > 0 && (
          <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
            Unsupported placeholders: <span className="font-mono">{unsupported.join(', ')}</span>.
            Replace n8n expressions with app variables, e.g.{' '}
            <span className="font-mono">{'{{topic}}'}</span>,{' '}
            <span className="font-mono">{'{{prior_improvements}}'}</span>,{' '}
            <span className="font-mono">{'{{current_date}}'}</span>.
          </p>
        )}
        {unknown.length > 0 && (
          <p role="alert" className="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
            The app doesn’t pass{' '}
            <span className="font-mono">{unknown.map((v) => `{{${v}}}`).join(', ')}</span> to this
            prompt. Jobs would fail with “missing variable”.
          </p>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="p-notes">Notes</Label>
          <Input id="p-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={onSave} disabled={!dirty || save.isPending}>
            Save as new version
          </Button>
          {!viewing.is_active && (
            <Button variant="outline" onClick={onActivate} disabled={dirty || activate.isPending}>
              Activate v{viewing.version}
            </Button>
          )}
          {viewing.is_active && (
            <StatusBadge meta={{ label: `v${viewing.version} is active`, tone: 'success' }} />
          )}
          {dirty && <span className="text-xs text-muted">Unsaved changes</span>}
        </div>
        {message && (
          <p
            role={message.tone === 'error' ? 'alert' : 'status'}
            className={message.tone === 'error' ? 'text-sm text-danger' : 'text-sm text-success'}
          >
            {message.text}
          </p>
        )}
      </section>

      <TestRunPanel promptKey={promptKey} body={body} model={model} />
    </div>
  );
}
