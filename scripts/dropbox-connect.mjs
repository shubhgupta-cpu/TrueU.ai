// Connects the app to Dropbox: gets an offline refresh token and saves it to .env.local.
//
// 1. Create a Dropbox app (https://www.dropbox.com/developers/apps): Scoped access, "Full Dropbox"
//    (or "App folder", OQ-2). Permissions tab: files.metadata.read/write, files.content.read/write,
//    sharing.read/write. Put its App key / App secret in .env.local as DROPBOX_APP_KEY / _SECRET.
// 2. npm run dropbox:connect              → prints a link; open it, allow, copy the code
// 3. npm run dropbox:connect -- <code>    → saves DROPBOX_REFRESH_TOKEN to .env.local
import { readEnvFile, writeEnvValue } from './airtable/lib.mjs';

const env = readEnvFile();
const key = env.DROPBOX_APP_KEY;
const secret = env.DROPBOX_APP_SECRET;
if (!key || !secret) {
  console.error('Set DROPBOX_APP_KEY and DROPBOX_APP_SECRET in .env.local first (see the comment at the top of this script).');
  process.exit(1);
}

const code = process.argv[2];
if (!code) {
  const url = new URL('https://www.dropbox.com/oauth2/authorize');
  url.search = new URLSearchParams({ client_id: key, response_type: 'code', token_access_type: 'offline' }).toString();
  console.log(`Open this link, click Allow, and copy the code Dropbox shows:\n\n  ${url}\n\nThen run:  npm run dropbox:connect -- <code>`);
  process.exit(0);
}

const res = await fetch('https://api.dropbox.com/oauth2/token', {
  method: 'POST',
  headers: {
    Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  body: new URLSearchParams({ code, grant_type: 'authorization_code' }),
});
const data = await res.json().catch(() => ({}));
if (!res.ok || !data.refresh_token) {
  console.error(`Dropbox refused the code: ${data.error_description ?? data.error ?? res.status}. Codes work once and expire quickly; get a new one.`);
  process.exit(1);
}

const account = await fetch('https://api.dropboxapi.com/2/users/get_current_account', {
  method: 'POST',
  headers: { Authorization: `Bearer ${data.access_token}` },
})
  .then((r) => r.json())
  .catch(() => null);

writeEnvValue('DROPBOX_REFRESH_TOKEN', data.refresh_token);
console.log(
  `Connected${account?.email ? ` to ${account.email}'s Dropbox` : ''}. Saved DROPBOX_REFRESH_TOKEN to .env.local.` +
    '\nIn production, add the same value as a Vercel environment variable.',
);
