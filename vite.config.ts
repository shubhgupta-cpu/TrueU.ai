/// <reference types="vitest" />
import type { IncomingMessage, ServerResponse } from 'node:http';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite';

/**
 * Development only: serves /api/* from server/router.ts inside the Vite dev server, so
 * `npm run dev` runs the whole app (on Vercel, api/index.ts does the same job). Server secrets
 * come from .env.local into process.env; they are never exposed to the browser bundle.
 */
function devApi(): Plugin {
  return {
    name: 'trueu-dev-api',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      Object.assign(process.env, loadEnv(server.config.mode, process.cwd(), ''));
      server.middlewares.use('/api', async (req: IncomingMessage, res: ServerResponse) => {
        try {
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) {
            if (typeof v === 'string') headers.set(k, v);
            else if (Array.isArray(v)) headers.set(k, v.join(', '));
          }
          const request = new Request(`http://${req.headers.host}/api${req.url ?? ''}`, {
            method: req.method,
            headers,
            body: chunks.length && req.method !== 'GET' ? Buffer.concat(chunks) : undefined,
          });
          const { handle } = (await server.ssrLoadModule('/server/router.ts')) as {
            handle: (r: Request) => Promise<Response>;
          };
          const response = await handle(request);
          res.statusCode = response.status;
          response.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), devApi()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 5173 },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}', 'server/**/*.test.ts'],
  },
});
