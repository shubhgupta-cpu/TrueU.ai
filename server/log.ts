// Activity, usage and notifications (CLAUDE.md rule 13). Logging never throws: a failed log write
// must not fail the work it describes.
import { create, createOne, eq, list, nowIso, T, toJson } from './airtable.js';

export type ActorType = 'user' | 'system' | 'webhook' | 'email';

export interface ActivityEntry {
  event: string;
  projectId?: string | null;
  topicId?: string | null;
  actorId?: string | null;
  actorType?: ActorType;
  details?: Record<string, unknown>;
}

export async function activity(entry: ActivityEntry): Promise<void> {
  try {
    await createOne(T.activityLog, {
      Event: entry.event,
      'Actor Type': entry.actorType ?? (entry.actorId ? 'user' : 'system'),
      Details: toJson(entry.details ?? {}),
      Created: nowIso(),
      ...(entry.projectId ? { Project: [entry.projectId] } : {}),
      ...(entry.topicId ? { Topic: [entry.topicId] } : {}),
      ...(entry.actorId ? { Actor: [entry.actorId] } : {}),
    });
  } catch (err) {
    console.error('activity log write failed', entry.event, err);
  }
}

export interface UsageEntry {
  provider: 'anthropic' | 'bannerbear' | 'serpapi';
  model?: string;
  jobId?: string | null;
  projectId?: string | null;
  promptKey?: string;
  inputTokens?: number;
  outputTokens?: number;
  units?: number;
  costUsd?: number;
  durationMs?: number;
}

export async function usage(entry: UsageEntry): Promise<void> {
  try {
    await createOne(T.usageLog, {
      Name: [entry.provider, entry.promptKey ?? entry.model].filter(Boolean).join(' · '),
      Provider: entry.provider,
      Model: entry.model,
      'Prompt Key': entry.promptKey,
      'Input Tokens': entry.inputTokens,
      'Output Tokens': entry.outputTokens,
      Units: entry.units,
      'Cost USD': entry.costUsd,
      'Duration Ms': entry.durationMs,
      Created: nowIso(),
      ...(entry.jobId ? { Job: [entry.jobId] } : {}),
      ...(entry.projectId ? { Project: [entry.projectId] } : {}),
    });
  } catch (err) {
    console.error('usage log write failed', err);
  }
}

/** In-app notification to every admin (architecture.md §7). */
export async function notifyAdmins(n: {
  kind: string;
  title: string;
  body?: string;
  link?: string;
}) {
  try {
    const admins = await list(T.users, { filterByFormula: eq('Role', 'admin'), fields: ['Email'] });
    await create(
      T.notifications,
      admins.map((a) => ({
        Title: n.title,
        Kind: n.kind,
        Body: n.body,
        Link: n.link,
        User: [a.id],
        Created: nowIso(),
      })),
    );
  } catch (err) {
    console.error('notification write failed', err);
  }
}
