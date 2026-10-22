// Creates an app user in the Airtable "Users" table, or resets an existing user's password.
// Invite-only: this is the only way to add a login (F1.1).
//
//   npm run user:create -- <email> <owner|admin|editor> ["Full Name"] [--password <pw>]
//
// Without --password a random one is generated and printed once.
import { randomBytes } from 'node:crypto';
// @ts-expect-error -- plain .mjs helper without type declarations
import { readEnvFile } from './airtable/lib.mjs';

Object.assign(process.env, readEnvFile());

const { hashPassword, findUserByEmail } = await import('../server/auth.js');
const { createOne, nowIso, T, updateOne } = await import('../server/airtable.js');

const args = process.argv.slice(2);
const pwIndex = args.indexOf('--password');
const given = pwIndex >= 0 ? args.splice(pwIndex, 2)[1] : undefined;
const [email, role, fullName] = args;

if (!email || !role || !['owner', 'admin', 'editor'].includes(role)) {
  console.error('Usage: npm run user:create -- <email> <owner|admin|editor> ["Full Name"] [--password <pw>]');
  process.exit(1);
}
if (given !== undefined && given.length < 10) {
  console.error('Use a password of at least 10 characters.');
  process.exit(1);
}

const password = given ?? randomBytes(12).toString('base64url');
const hash = await hashPassword(password);
const existing = await findUserByEmail(email);

if (existing) {
  await updateOne(T.users, existing.id, {
    'Password Hash': hash,
    Role: role,
    ...(fullName ? { 'Full Name': fullName } : {}),
    Updated: nowIso(),
  });
  console.log(`Updated ${email} (${role}).`);
} else {
  await createOne(T.users, {
    Email: email.trim().toLowerCase(),
    'Full Name': fullName,
    Role: role,
    'Password Hash': hash,
    Created: nowIso(),
    Updated: nowIso(),
  });
  console.log(`Created ${email} (${role}).`);
}
if (!given) console.log(`Password: ${password}\nShare it privately; it isn't shown again.`);
