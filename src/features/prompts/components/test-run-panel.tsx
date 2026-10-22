import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import { Textarea } from '@/components/ui/textarea';
import { useSampleVariables, useTestRun } from '../api';

/** Runs the editor's current text (saved or not) against sample variables. Nothing is saved. */
export function TestRunPanel({
  promptKey,
  body,
  model,
}: {
  promptKey: string;
  body: string;
  model: string;
}) {
  const sample = useSampleVariables(promptKey);
  const test = useTestRun();
  const [vars, setVars] = useState('{}');
  const [varsError, setVarsError] = useState<string | null>(null);

  useEffect(() => {
    if (sample.data) setVars(JSON.stringify(sample.data.variables, null, 2));
  }, [sample.data]);

  const run = () => {
    setVarsError(null);
    let variables: Record<string, unknown>;
    try {
      variables = JSON.parse(vars);
    } catch {
      setVarsError('Variables must be valid JSON.');
      return;
    }
    test.mutate({ key: promptKey, body, model: model || undefined, variables });
  };

  const r = test.data;
  return (
    <section
      className="space-y-4 rounded-lg border border-line bg-surface p-6"
      aria-labelledby="test-run-heading"
    >
      <div>
        <h2 id="test-run-heading" className="text-xl font-semibold">
          Test run
        </h2>
        <p className="text-sm text-muted">
          Calls Claude once with the text in the editor and these variables. Results aren’t saved.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="test-vars">Variables (JSON)</Label>
        <Textarea
          id="test-vars"
          className="min-h-[160px] font-mono text-xs"
          value={vars}
          onChange={(e) => setVars(e.target.value)}
          aria-invalid={!!varsError}
        />
        {varsError && <p className="text-sm text-danger">{varsError}</p>}
      </div>
      <Button onClick={run} disabled={test.isPending}>
        {test.isPending ? 'Running…' : 'Run test'}
      </Button>

      {test.error && (
        <p role="alert" className="text-sm text-danger">
          {test.error.message}
        </p>
      )}
      {r && (
        <div className="space-y-3" aria-live="polite">
          <div className="flex flex-wrap items-center gap-2">
            {r.schema_checked ? (
              <StatusBadge
                meta={
                  r.valid
                    ? { label: 'Valid output', tone: 'success' }
                    : { label: 'Invalid output', tone: 'danger' }
                }
              />
            ) : (
              <StatusBadge
                meta={
                  r.valid
                    ? { label: 'Valid JSON (no schema yet)', tone: 'neutral' }
                    : { label: 'Not JSON', tone: 'danger' }
                }
              />
            )}
            {r.warnings.length > 0 && (
              <StatusBadge meta={{ label: `${r.warnings.length} warnings`, tone: 'warning' }} />
            )}
            <span className="font-mono text-xs text-muted">
              {r.model} · {r.usage.input_tokens} in / {r.usage.output_tokens} out ·{' '}
              {(r.duration_ms / 1000).toFixed(1)}s
            </span>
          </div>
          {r.errors && (
            <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
              <span className="font-medium">Validation errors:</span> {r.errors}
            </p>
          )}
          {r.warnings.length > 0 && (
            <ul className="list-disc space-y-1 rounded-md bg-warning-soft py-2 pl-8 pr-3 text-sm text-warning">
              {r.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          <details>
            <summary className="min-h-touch cursor-pointer py-2 text-sm font-medium">
              Rendered prompt
            </summary>
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-ground p-3 font-mono text-xs">
              {r.rendered_prompt}
            </pre>
          </details>
          <div>
            <p className="text-sm font-medium">Raw output</p>
            <pre className="mt-1 max-h-[480px] overflow-auto whitespace-pre-wrap rounded-md bg-ground p-3 font-mono text-xs">
              {r.raw}
            </pre>
          </div>
        </div>
      )}
    </section>
  );
}
