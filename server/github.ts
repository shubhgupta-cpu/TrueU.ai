// Starts the transcription worker (.github/workflows/transcribe.yml) through the GitHub API.
import { env } from './env.js';

export const workerConfigured = (): boolean =>
  !!(env('GITHUB_REPO') && env('GITHUB_DISPATCH_TOKEN'));

/** Asks GitHub to run the workflow now. The worker reads its work from Airtable, so nothing else is sent. */
export async function dispatchTranscribe(): Promise<void> {
  const repo = env('GITHUB_REPO');
  const token = env('GITHUB_DISPATCH_TOKEN');
  if (!repo || !token) throw new Error('GITHUB_REPO and GITHUB_DISPATCH_TOKEN are not set');
  const res = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/transcribe.yml/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'trueu-content-cockpit',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main' }),
      signal: AbortSignal.timeout(20_000),
    },
  );
  if (res.status !== 204) {
    const hint =
      res.status === 404 || res.status === 403
        ? ' (check the token: Actions read and write on this repository)'
        : '';
    throw new Error(`GitHub answered ${res.status} when starting the transcription worker${hint}`);
  }
}
