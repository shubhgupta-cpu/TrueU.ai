import type { ReactNode } from 'react';
import { StatusBadge } from '@/components/ui/status-badge';
import type { Script, ScriptVersion } from '@/types/api';

const SCENE_NAMES = [
  'Opening Examples',
  'Context and Tension',
  'Emotional Root',
  'Bridge Questions',
  'Common-Ground Reframe',
  'Reflection Bridge to CTA',
] as const;
const SCENE_KEYS = ['scene_1', 'scene_2', 'scene_3', 'scene_4', 'scene_5', 'scene_6'] as const;

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4 border-t border-line pt-6">
      <h3 className="flex items-center gap-2 font-sans text-sm font-bold uppercase tracking-wider text-accent">
        <span aria-hidden className="h-4 w-1 rounded-full bg-accent" />
        {title}
      </h3>
      {children}
    </section>
  );
}

function Details({ items }: { items: Array<[string, string | undefined]> }) {
  const shown = items.filter(([, v]) => v && v.trim());
  if (!shown.length) return null;
  return (
    <dl className="mt-3 grid gap-x-4 gap-y-1.5 rounded-md bg-ground p-3 text-sm sm:grid-cols-[auto_1fr]">
      {shown.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="font-semibold text-ink">{k}</dt>
          <dd className="text-muted">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

export function ScriptView({ version }: { version: ScriptVersion }) {
  const s: Script | null = version.script;
  if (!s) {
    return (
      <p role="alert" className="text-sm text-danger">
        This version’s script data couldn’t be read. Generate a new version.
      </p>
    );
  }
  const lf = s.long_form_storyboard;
  const clipFor = (n: number) =>
    s.clip_timestamps.filter((c) => c.scene_location.includes(String(n)));

  return (
    <div className="space-y-8 text-base leading-7">
      <div className="space-y-2">
        <h3 className="text-3xl font-bold leading-tight">{s.episode_metadata.episode_title}</h3>
        <p className="text-base text-muted">{s.episode_metadata.topic}</p>
        {s.episode_metadata.shared_value && (
          <StatusBadge
            meta={{ label: `Shared value: ${s.episode_metadata.shared_value}`, tone: 'accent' }}
          />
        )}
      </div>

      {version.warnings.length > 0 && (
        <details className="rounded-md bg-warning-soft px-4 py-2 text-sm text-warning">
          <summary className="min-h-touch cursor-pointer py-2">
            {version.warnings.length} brand or length rule{version.warnings.length === 1 ? '' : 's'}{' '}
            not met. Review before approving
          </summary>
          <ul className="list-disc space-y-1 pb-2 pl-5">
            {version.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </details>
      )}

      <Block title="Opening examples">
        {[s.opening_examples.example_a, s.opening_examples.example_b].map((e, i) => (
          <div key={i} className="space-y-1 rounded-md border border-line p-4">
            <p className="text-base font-bold">
              {i === 0 ? 'A' : 'B'}. {e.perspective}
            </p>
            <p>{e.story}</p>
            <p className="font-medium text-accent">{e.shared_value_expression}</p>
          </div>
        ))}
        <p className="rounded-md bg-accent-soft p-4 font-medium italic">
          {s.opening_examples.connecting_statement}
        </p>
      </Block>

      <Block title="Long-form storyboard">
        <ol className="space-y-8">
          {SCENE_KEYS.map((k, i) => {
            const sc = lf[k];
            return (
              <li key={k}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-lg font-bold">
                    Scene {i + 1}. {SCENE_NAMES[i]}
                  </span>
                  <span className="font-mono text-xs text-muted">{sc.time_range}</span>
                  <span className="font-mono text-xs text-muted">{words(sc.narration)} words</span>
                  {clipFor(i + 1).map((c) => (
                    <StatusBadge
                      key={c.clip_number}
                      meta={{ label: `Short ${c.clip_number}`, tone: 'accent' }}
                    />
                  ))}
                </div>
                <p className="mt-2 whitespace-pre-wrap border-l-4 border-accent/40 pl-4 text-[17px] leading-8">
                  {sc.narration}
                </p>
                <Details
                  items={[
                    ['On screen', sc.on_screen_text.join(' / ')],
                    ['B-roll', sc.b_roll],
                    ['Background', sc.narrator_background],
                    ['Camera', sc.camera],
                    ['Music', sc.music],
                    ['Beat', sc.emotional_beat],
                  ]}
                />
              </li>
            );
          })}
          <li>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-bold">Scene 7. Topic-Specific CTA</span>
              <span className="font-mono text-xs text-muted">{lf.scene_7_cta.time_range}</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap border-l-4 border-accent/40 pl-4 text-[17px] leading-8">
              {lf.scene_7_cta.narration}
            </p>
            <Details
              items={[
                ['On screen', lf.scene_7_cta.on_screen_text_progression.join(' / ')],
                ['Background', lf.scene_7_cta.narrator_background],
                ['Camera', lf.scene_7_cta.camera],
                ['Music', lf.scene_7_cta.music],
              ]}
            />
          </li>
          <li>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-bold">Scene 8. Branded Outro</span>
              <span className="font-mono text-xs text-muted">{lf.scene_8_outro.time_range}</span>
            </div>
            <p className="mt-2 border-l-4 border-accent/40 pl-4 text-[17px] italic leading-8">
              {lf.scene_8_outro.core_message}
            </p>
          </li>
        </ol>
      </Block>

      <Block title="Clip timestamps (Short 1–3)">
        <ul className="space-y-2">
          {s.clip_timestamps.map((c) => (
            <li key={c.clip_number}>
              <span className="font-bold">Short {c.clip_number}</span>{' '}
              <span className="font-mono text-xs">{c.timecode}</span>{' '}
              <span className="text-muted">
                ({c.scene_location}) “{c.hook_line}”
              </span>
            </li>
          ))}
        </ul>
      </Block>

      <Block title={`Short-form clips (${s.short_form_clips.length})`}>
        <ul className="grid gap-3 md:grid-cols-2">
          {s.short_form_clips.map((c) => (
            <li key={c.clip_id} className="rounded-md border border-line p-4">
              <p className="text-base font-bold">
                {c.clip_id}. {c.title}
              </p>
              <p className="font-mono text-xs text-muted">
                {c.duration} · {c.emotional_tone}
              </p>
              <p className="mt-1">{c.hook_content}</p>
              <Details
                items={[
                  ['Tease', c.platform_tease],
                  ['Visual', c.visual],
                  ['Music', c.music],
                ]}
              />
            </li>
          ))}
        </ul>
      </Block>

      <Block title="YouTube">
        <p className="text-lg font-bold">
          {s.youtube_optimization.title}{' '}
          <span className="font-mono text-xs text-muted">
            ({s.youtube_optimization.title.length}/60)
          </span>
        </p>
        <p className="whitespace-pre-wrap">{s.youtube_optimization.description}</p>
        <Details
          items={[
            ['Tags', s.youtube_optimization.tags.join(', ')],
            ['Hashtags', s.youtube_optimization.hashtags.join(' ')],
            ['Thumbnail', s.youtube_optimization.thumbnail_concept],
          ]}
        />
      </Block>

      <Block title="Closing reflection">
        <p className="text-[17px] leading-8">{s.closing_reflection}</p>
        <Details items={[['Transitions', s.transition_notes]]} />
      </Block>
    </div>
  );
}
