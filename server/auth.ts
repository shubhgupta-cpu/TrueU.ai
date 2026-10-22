// Login without an auth provider: users live in the Airtable "Users" table with a scrypt password
// hash; a signed, HttpOnly session cookie identifies them. Invite-only: users are created with
// `npm run user:create`, never from the login page (F1.1).
import { memo } from './cache.js';
import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { AppRole } from '../src/lib/status.js';
import type { Profile } from '../src/types/api.js';
import { first, get, lit, T } from './airtable.js';
import { requireEnv, isProduction } from './env.js';
import { HttpError } from './http.js';
import { toProfile } from './mappers.js';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const COOKIE = 'tu_session';
const SESSION_DAYS = 14;

export const STAFF: readonly AppRole[] = ['owner', 'admin'];

// ---- passwords: "scrypt$<salt b64url>$<hash b64url>"

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 32);
  return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const actual = await scrypt(password, Buffer.from(salt, 'base64url'), expected.length);
  return timingSafeEqual(actual, expected);
}

// ---- session token: "<userId>.<expiresUnix>.<hmac>"

function sign(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

export function createSessionToken(
  userId: string,
  now = Date.now(),
  secret = requireEnv('SESSION_SECRET'),
) {
  const exp = Math.floor(now / 1000) + SESSION_DAYS * 86_400;
  const data = `${userId}.${exp}`;
  return `${data}.${sign(data, secret)}`;
}

/** Returns the user ID of a valid, unexpired token, else null. */
export function verifySessionToken(
  token: string,
  now = Date.now(),
  secret = requireEnv('SESSION_SECRET'),
): string | null {
  const [userId, exp, mac] = token.split('.');
  if (!userId || !exp || !mac) return null;
  const expected = Buffer.from(sign(`${userId}.${exp}`, secret));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  if (Number(exp) * 1000 < now) return null;
  return userId;
}

export function sessionCookie(token: string): string {
  const secure = isProduction() ? '; Secure' : '';
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86_400}${secure}`;
}

export function clearedCookie(): string {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get('cookie') ?? '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

// ---- request guards

export async function findUserByEmail(email: string) {
  return first(T.users, { filterByFormula: `LOWER({Email})=${lit(email.trim().toLowerCase())}` });
}

/** The signed-in user, or null. Re-read from Airtable at most every 30 s per instance, so a removed user or a changed role takes effect within half a minute. */
export async function currentUser(req: Request): Promise<Profile | null> {
  const token = readCookie(req, COOKIE);
  const userId = token ? verifySessionToken(token) : null;
  if (!userId) return null;
  const profile = await memo(`user:${userId}`, 30_000, async () => {
    const rec = await get(T.users, userId);
    return rec && rec.fields['Password Hash'] ? toProfile(rec) : null; // removed or reset → signed out
  });
  return profile;
}

/** 401 when signed out; 403 when the role isn't allowed. */
export async function requireUser(
  req: Request,
  roles: readonly AppRole[] = STAFF,
): Promise<Profile> {
  const user = await currentUser(req);
  if (!user) throw new HttpError(401, 'Sign in to continue.');
  if (!roles.includes(user.role)) throw new HttpError(403, 'Your role can’t do this.');
  return user;
}

/** Vercel Cron: "Authorization: Bearer <CRON_SECRET>". */
export function requireCron(req: Request): void {
  const given = Buffer.from(req.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${requireEnv('CRON_SECRET')}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw new HttpError(401, 'Unauthorized');
  }
}

export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;

/** After 5 wrong passwords in a row the account is locked for 15 minutes (pure; tested). */
export function loginAttempt(
  state: { failed: number; lockedUntil: string | null },
  now: number,
): { locked: false } | { locked: true; minutes: number } {
  const until = state.lockedUntil ? Date.parse(state.lockedUntil) : 0;
  return until > now
    ? { locked: true, minutes: Math.ceil((until - now) / 60_000) }
    : { locked: false };
}

/** The fields to store after a wrong password. */
export function afterFailure(
  failed: number,
  now: number,
): { 'Failed Logins': number; 'Locked Until'?: string } {
  const count = failed + 1;
  return count >= MAX_FAILED_LOGINS
    ? { 'Failed Logins': 0, 'Locked Until': new Date(now + LOCK_MINUTES * 60_000).toISOString() }
    : { 'Failed Logins': count };
}
