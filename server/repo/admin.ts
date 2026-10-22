// Admin → Users and Usage.
import { randomBytes } from 'node:crypto';
import type { AdminUser, UsageSummary } from '../../src/types/api.js';
import { createOne, get, link, list, nowIso, num, str, T, updateOne } from '../airtable.js';
import { findUserByEmail, hashPassword } from '../auth.js';
import { dropMemo } from '../cache.js';
import { HttpError } from '../http.js';
import { activity } from '../log.js';
import { summarizeUsage, type UsageRow } from '../usage.js';

type Role = AdminUser['role'];

const toAdminUser = (r: {
  id: string;
  createdTime: string;
  fields: Record<string, unknown>;
}): AdminUser => ({
  id: r.id,
  email: str(r.fields, 'Email') ?? '',
  full_name: str(r.fields, 'Full Name'),
  role: (str(r.fields, 'Role') ?? 'editor') as Role,
  active: typeof r.fields['Password Hash'] === 'string' && r.fields['Password Hash'] !== '',
  locked_until:
    Date.parse(str(r.fields, 'Locked Until') ?? '') > Date.now()
      ? str(r.fields, 'Locked Until')
      : null,
  last_sign_in: str(r.fields, 'Last Sign In'),
  created_at: str(r.fields, 'Created') ?? r.createdTime,
});

export async function listUsers(): Promise<AdminUser[]> {
  const rows = await list(T.users, { sort: [{ field: 'Created', direction: 'asc' }] });
  return rows.map(toAdminUser);
}

/** Why this change is not allowed, or null. Nobody can lock themselves out or remove the last admin. */
export function accessChangeError(
  users: Array<Pick<AdminUser, 'id' | 'role' | 'active'>>,
  targetId: string,
  actorId: string,
  change: 'remove' | { role: Role },
): string | null {
  const target = users.find((u) => u.id === targetId);
  if (!target) return 'User not found';
  const losesAdmin = target.role === 'admin' && (change === 'remove' || change.role !== 'admin');
  if (change !== 'remove' && !losesAdmin) return null;
  if (targetId === actorId) {
    return change === 'remove'
      ? 'You can’t remove your own access.'
      : 'You can’t change your own role.';
  }
  if (losesAdmin && users.filter((u) => u.role === 'admin' && u.active).length <= 1) {
    return 'There must be at least one admin.';
  }
  return null;
}

const newPassword = () => randomBytes(12).toString('base64url');

export async function createUser(
  email: string,
  role: Role,
  fullName: string | null,
  actor: string,
) {
  if (await findUserByEmail(email)) throw new HttpError(409, 'That email already has an account.');
  const password = newPassword();
  const rec = await createOne(T.users, {
    Email: email.trim().toLowerCase(),
    'Full Name': fullName,
    Role: role,
    'Password Hash': await hashPassword(password),
    Created: nowIso(),
    Updated: nowIso(),
  });
  await activity({ event: 'user_created', actorId: actor, details: { email, role } });
  return { user: toAdminUser(rec), password };
}

export async function changeRole(id: string, role: Role, actor: string): Promise<void> {
  const err = accessChangeError(await listUsers(), id, actor, { role });
  if (err) throw new HttpError(409, err);
  await updateOne(T.users, id, { Role: role, Updated: nowIso() });
  dropMemo(`user:${id}`);
  await activity({ event: 'user_role_changed', actorId: actor, details: { user: id, role } });
}

/** Clears the password hash: the person is signed out (within 30 s) and can't sign in. The record stays. */
export async function removeAccess(id: string, actor: string): Promise<void> {
  const err = accessChangeError(await listUsers(), id, actor, 'remove');
  if (err) throw new HttpError(409, err);
  await updateOne(T.users, id, { 'Password Hash': null, Updated: nowIso() });
  dropMemo(`user:${id}`);
  await activity({ event: 'user_access_removed', actorId: actor, details: { user: id } });
}

/** A new random password (shown once). Also restores removed access and clears a lockout. */
export async function resetPassword(id: string, actor: string): Promise<string> {
  if (!(await get(T.users, id))) throw new HttpError(404, 'User not found');
  const password = newPassword();
  await updateOne(T.users, id, {
    'Password Hash': await hashPassword(password),
    'Failed Logins': 0,
    'Locked Until': null,
    Updated: nowIso(),
  });
  dropMemo(`user:${id}`);
  await activity({ event: 'user_password_reset', actorId: actor, details: { user: id } });
  return password;
}

const DAYS = 90;

export async function usageSummary(): Promise<UsageSummary> {
  const since = new Date(Date.now() - DAYS * 86_400_000).toISOString();
  const [rows, projects] = await Promise.all([
    list(T.usageLog, { filterByFormula: `IS_AFTER({Created},${JSON.stringify(since)})` }),
    list(T.projects, { fields: ['Title'] }),
  ]);
  const titles = new Map(projects.map((p) => [p.id, str(p.fields, 'Title') ?? '(untitled)']));
  const usage: UsageRow[] = rows.map((r) => ({
    at: str(r.fields, 'Created') ?? r.createdTime,
    provider: str(r.fields, 'Provider') ?? 'other',
    key: str(r.fields, 'Prompt Key') ?? '',
    model: str(r.fields, 'Model') ?? '',
    project: titles.get(link(r.fields, 'Project') ?? '') ?? '',
    input: num(r.fields, 'Input Tokens') ?? 0,
    output: num(r.fields, 'Output Tokens') ?? 0,
    cost: num(r.fields, 'Cost USD') ?? 0,
    ms: num(r.fields, 'Duration Ms') ?? 0,
  }));
  return summarizeUsage(usage, since.slice(0, 10));
}
