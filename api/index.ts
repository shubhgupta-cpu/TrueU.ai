// The single Vercel function. vercel.json rewrites every /api/* request here; server/router.ts
// dispatches it. In development the Vite dev server calls the same router (vite.config.ts).
import { handle } from '../server/router.js';

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
