// Server-side configuration. Values come from process.env: Vercel environment variables in
// production, .env.local in development (loaded by the Vite dev server and the scripts).

export function env(name: string): string | undefined {
  const v = process.env[name];
  return v === undefined || v === '' ? undefined : v;
}

export function requireEnv(name: string): string {
  const v = env(name);
  if (!v) throw new Error(`Missing environment variable ${name} (see .env.example)`);
  return v;
}

/** MOCK_EXTERNAL=true: Claude, SerpAPI and Dropbox return fixtures (CLAUDE.md rule 14). */
export function isMock(): boolean {
  return env('MOCK_EXTERNAL') === 'true';
}

export function isProduction(): boolean {
  return env('VERCEL_ENV') === 'production' || env('NODE_ENV') === 'production';
}
