import { useEffect, useState } from 'react';
import { useAuth } from '@/app/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { setting, useSettings, useUpdateSetting } from '../api';

/** score_threshold / score_max / auto_regenerate_topics. Changes apply to the next scoring (F3 done-criterion). */
export function ScoringSettings() {
  const settings = useSettings();
  const update = useUpdateSetting();
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  const [threshold, setThreshold] = useState('');
  const [max, setMax] = useState('');
  const [autoRegen, setAutoRegen] = useState(true);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!settings.data) return;
    setThreshold(String(setting(settings.data, 'score_threshold', 45)));
    setMax(String(setting(settings.data, 'score_max', 60)));
    setAutoRegen(setting(settings.data, 'auto_regenerate_topics', true));
  }, [settings.data]);

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    const t = Number(threshold);
    const m = Number(max);
    if (!Number.isInteger(t) || !Number.isInteger(m) || t < 1 || m < 1 || t > m) {
      setMessage({
        tone: 'error',
        text: 'Use whole numbers, with the pass mark no higher than the maximum.',
      });
      return;
    }
    try {
      await update.mutateAsync({ key: 'score_threshold', value: t });
      await update.mutateAsync({ key: 'score_max', value: m });
      await update.mutateAsync({ key: 'auto_regenerate_topics', value: autoRegen });
      setMessage({
        tone: 'ok',
        text: 'Saved. New scores use these values; existing scores keep theirs.',
      });
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Couldn’t save.' });
    }
  };

  return (
    <form onSubmit={onSave} className="max-w-xl space-y-5" noValidate>
      {!isAdmin && <p className="text-sm text-muted">Only admins can change these settings.</p>}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="s-threshold">Pass mark</Label>
          <Input
            id="s-threshold"
            inputMode="numeric"
            className="font-mono"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            disabled={!isAdmin}
          />
          <p className="text-xs text-muted">Topics at or above this are “Qualified”.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="s-max">Maximum score</Label>
          <Input
            id="s-max"
            inputMode="numeric"
            className="font-mono"
            value={max}
            onChange={(e) => setMax(e.target.value)}
            disabled={!isAdmin}
          />
          <p className="text-xs text-muted">6 criteria × 10 points.</p>
        </div>
      </div>
      <div className="flex items-start gap-3">
        <input
          id="s-autoregen"
          type="checkbox"
          className="mt-0.5 h-5 w-5 accent-accent"
          checked={autoRegen}
          onChange={(e) => setAutoRegen(e.target.checked)}
          disabled={!isAdmin}
        />
        <div>
          <Label htmlFor="s-autoregen">Improve topics that score below the pass mark</Label>
          <p className="text-xs text-muted">
            Runs the regeneration prompt once with the score’s suggestions and adds the rewritten
            topic, scored, next to the original.
          </p>
        </div>
      </div>
      {isAdmin && (
        <Button type="submit" disabled={update.isPending}>
          Save
        </Button>
      )}
      {message && (
        <p
          role={message.tone === 'error' ? 'alert' : 'status'}
          className={message.tone === 'error' ? 'text-sm text-danger' : 'text-sm text-success'}
        >
          {message.text}
        </p>
      )}
    </form>
  );
}
