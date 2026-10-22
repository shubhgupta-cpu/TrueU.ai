import { describe, expect, it } from 'vitest';
import {
  isPlaceholderPrompt,
  promptVariables,
  unknownVariables,
  unsupportedPlaceholders,
} from '@/features/prompts/logic';

describe('prompt editor checks', () => {
  const n8n = `<topic_to_evaluate>{{ $json['All Topics'] }}</topic_to_evaluate>
<prior_improvements>{{ $json.fields['Improvements for Topics'] }}</prior_improvements>
<current_date>{{ $now }}</current_date>`;

  it('flags the n8n placeholders from the client’s workflow', () => {
    expect(unsupportedPlaceholders(n8n)).toEqual([
      "{{ $json['All Topics'] }}",
      "{{ $json.fields['Improvements for Topics'] }}",
      '{{ $now }}',
    ]);
  });

  it('accepts the app’s variables once replaced', () => {
    const fixed = '<t>{{topic}}</t><p>{{ prior_improvements }}</p><d>{{current_date}}</d>';
    expect(unsupportedPlaceholders(fixed)).toEqual([]);
    expect(promptVariables(fixed)).toEqual(['topic', 'prior_improvements', 'current_date']);
    expect(unknownVariables('topic_regenerate', fixed)).toEqual([]);
  });

  it('warns about variables the app never passes for that key', () => {
    expect(unknownVariables('topic_score', '{{topic}} {{prior_improvements}}')).toEqual([
      'prior_improvements',
    ]);
  });

  it('detects the seeded TODO placeholder', () => {
    expect(isPlaceholderPrompt("  TODO: paste the client's scoring prompt")).toBe(true);
    expect(isPlaceholderPrompt('<prompt>')).toBe(false);
  });
});
