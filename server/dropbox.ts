// Dropbox client (integrations.md §3): offline refresh token → short-lived access token (cached),
// folders, uploads and shared links. Mock mode returns fake IDs and writes nothing.
import { env, isMock, requireEnv } from './env.js';
import { PermanentJobError } from './jobs/rules.js';
import { UpstreamError, withRetry } from './retry.js';

let cached: { token: string; expiresAt: number } | null = null;

export function dropboxConfigured(): boolean {
  return (
    isMock() ||
    !!(env('DROPBOX_APP_KEY') && env('DROPBOX_APP_SECRET') && env('DROPBOX_REFRESH_TOKEN'))
  );
}

function assertConfigured() {
  if (!dropboxConfigured()) {
    throw new PermanentJobError(
      'Dropbox isn’t connected. Set DROPBOX_APP_KEY and DROPBOX_APP_SECRET, run `npm run dropbox:connect`, then retry.',
    );
  }
}

async function accessToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const basic = Buffer.from(
    `${requireEnv('DROPBOX_APP_KEY')}:${requireEnv('DROPBOX_APP_SECRET')}`,
  ).toString('base64');
  const res = await fetch('https://api.dropbox.com/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: requireEnv('DROPBOX_REFRESH_TOKEN'),
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new PermanentJobError(
      `Dropbox sign-in failed: ${data.error_description ?? res.status}. Reconnect with \`npm run dropbox:connect\`.`,
    );
  }
  cached = { token: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 14_400) * 1000 };
  return cached.token;
}

let rootHeader: string | null | undefined;

/**
 * On a Dropbox team account, paths default to the member's personal folder. The team's shared
 * folders ("Year - 2026" …) live in the team space, so every call is pinned to the account's root
 * namespace. For a personal account root = home and no header is needed.
 */
async function pathRoot(): Promise<string | null> {
  if (rootHeader !== undefined) return rootHeader;
  const res = await fetch('https://api.dropboxapi.com/2/users/get_current_account', {
    method: 'POST',
    headers: { Authorization: `Bearer ${await accessToken()}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok)
    throw new UpstreamError(`Dropbox users/get_current_account: ${res.status}`, res.status);
  const info = (
    (await res.json()) as { root_info?: { root_namespace_id: string; home_namespace_id: string } }
  ).root_info;
  rootHeader =
    info && info.root_namespace_id !== info.home_namespace_id
      ? JSON.stringify({ '.tag': 'root', root: info.root_namespace_id })
      : null;
  return rootHeader;
}

async function authHeaders(): Promise<Record<string, string>> {
  const root = await pathRoot();
  return {
    Authorization: `Bearer ${await accessToken()}`,
    ...(root ? { 'Dropbox-API-Path-Root': root } : {}),
  };
}

/** Dropbox-API-Arg must be ASCII: escape everything else as \uXXXX. */
export function apiArg(value: unknown): string {
  return JSON.stringify(value).replace(
    /[\u007f-￿]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}

interface DropboxErrorBody {
  error_summary?: string;
}

/** Dropbox errors are JSON (error_summary) or plain text (e.g. a missing permission). */
async function failure(res: Response, what: string): Promise<never> {
  const raw = await res.text().catch(() => '');
  let reason = raw.slice(0, 300) || String(res.status);
  try {
    reason = (JSON.parse(raw) as DropboxErrorBody).error_summary ?? reason;
  } catch {
    // plain text
  }
  if (/missing_scope|required scope/i.test(raw)) {
    throw new PermanentJobError(
      `Dropbox permission missing (${what}): tick files.metadata.write, files.content.read/write and sharing.write in the Dropbox app's Permissions tab, then run \`npm run dropbox:connect\` again.`,
    );
  }
  throw new UpstreamError(`Dropbox ${what}: ${reason}`, res.status);
}

async function rpc<T>(endpoint: string, body: unknown): Promise<T> {
  return withRetry(async () => {
    const res = await fetch(`https://api.dropboxapi.com/2/${endpoint}`, {
      method: 'POST',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) await failure(res, endpoint);
    return (await res.json()) as T;
  });
}

export interface FileMeta {
  id: string;
  rev: string;
  path_display: string;
}

/** Creates the folders; ones that already exist are reused (idempotent). Returns the first's ID. */
export async function ensureFolders(paths: string[]): Promise<string> {
  assertConfigured();
  if (isMock()) return 'id:mock-folder';
  for (const path of paths) {
    try {
      await rpc('files/create_folder_v2', { path, autorename: false });
    } catch (err) {
      if (
        !(
          err instanceof UpstreamError &&
          err.status === 409 &&
          /path\/conflict\/folder/.test(err.message)
        )
      )
        throw err;
    }
  }
  const meta = await rpc<{ id: string }>('files/get_metadata', { path: paths[0] });
  return meta.id;
}

/** A view link for the folder (created once; reused when it already exists). */
export async function sharedLink(path: string): Promise<string> {
  assertConfigured();
  if (isMock()) return `https://www.dropbox.com/mock${encodeURI(path)}`;
  try {
    const link = await rpc<{ url: string }>('sharing/create_shared_link_with_settings', { path });
    return link.url;
  } catch (err) {
    if (!(err instanceof UpstreamError && err.status === 409)) throw err;
    const list = await rpc<{ links: Array<{ url: string }> }>('sharing/list_shared_links', {
      path,
      direct_only: true,
    });
    if (!list.links[0]) throw err;
    return list.links[0].url;
  }
}

/**
 * Deletes files (they go to Dropbox's deleted files, restorable for 30+ days). A file that's
 * already gone is fine: someone may have removed or moved it by hand.
 */
export async function deleteFiles(paths: string[]): Promise<void> {
  assertConfigured();
  if (isMock()) return;
  for (const path of paths) {
    try {
      await rpc('files/delete_v2', { path });
    } catch (err) {
      if (err instanceof UpstreamError && err.status === 409 && /not_found/.test(err.message))
        continue;
      throw err;
    }
  }
}

/** Uploads a file. `overwrite` replaces it; `add` keeps both (Dropbox renames the new one). */
export async function upload(
  path: string,
  bytes: Uint8Array,
  mode: 'add' | 'overwrite' = 'overwrite',
): Promise<FileMeta> {
  assertConfigured();
  if (isMock()) return { id: 'id:mock-file', rev: 'mock', path_display: path };
  return withRetry(async () => {
    const res = await fetch('https://content.dropboxapi.com/2/files/upload', {
      method: 'POST',
      headers: {
        ...(await authHeaders()),
        'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': apiArg({ path, mode, autorename: true, mute: false }),
      },
      body: bytes,
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) await failure(res, `upload ${path}`);
    return (await res.json()) as FileMeta;
  });
}

export interface FolderEntry {
  id: string;
  rev: string;
  name: string;
  path: string;
  size: number;
}

/** Files directly inside a folder (not subfolders). A missing folder is an empty list. */
export async function listFiles(path: string): Promise<FolderEntry[]> {
  assertConfigured();
  if (isMock()) return [];
  try {
    const out: FolderEntry[] = [];
    let res = await rpc<ListResult>('files/list_folder', { path, limit: 200 });
    for (;;) {
      for (const e of res.entries) {
        if (e['.tag'] === 'file')
          out.push({
            id: e.id,
            rev: e.rev ?? '',
            name: e.name,
            path: e.path_display,
            size: e.size ?? 0,
          });
      }
      if (!res.has_more) return out;
      res = await rpc<ListResult>('files/list_folder/continue', { cursor: res.cursor });
    }
  } catch (err) {
    if (err instanceof UpstreamError && err.status === 409 && /not_found/.test(err.message))
      return [];
    throw err;
  }
}

/** Names of the subfolders directly inside a folder. A missing folder is an empty list. */
export async function listFolders(path: string): Promise<string[]> {
  assertConfigured();
  if (isMock()) return [];
  try {
    const res = await rpc<ListResult>('files/list_folder', { path, limit: 2000 });
    return res.entries.filter((e) => e['.tag'] === 'folder').map((e) => e.name);
  } catch (err) {
    if (err instanceof UpstreamError && err.status === 409 && /not_found/.test(err.message))
      return [];
    throw err;
  }
}

interface ListResult {
  entries: Array<{
    '.tag': string;
    id: string;
    rev?: string;
    name: string;
    path_display: string;
    size?: number;
  }>;
  cursor: string;
  has_more: boolean;
}

/** A link the browser can stream the file from for about 4 hours (for in-app previews). Empty in mock mode. */
export async function temporaryLink(fileId: string): Promise<string> {
  assertConfigured();
  if (isMock()) return '';
  return (await rpc<{ link: string }>('files/get_temporary_link', { path: fileId })).link;
}
