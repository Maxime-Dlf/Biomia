import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig, type Plugin } from 'vite';

/**
 * Liens d'invitation `/r/<CODE>` (§16.3) : redirigés vers `/#/r/<CODE>`, car les chemins des
 * fichiers sont relatifs (§16.2). En production, Caddy fait la même redirection.
 */
function inviteLinks(): Plugin {
  const redirect = (url: string | undefined) => /^\/r\/([A-Za-z0-9]{6})\/?$/.exec(url ?? '')?.[1];
  const middleware = (
    req: { url?: string },
    res: { statusCode: number; setHeader(k: string, v: string): void; end(): void },
    next: () => void,
  ) => {
    const code = redirect(req.url);
    if (!code) return next();
    res.statusCode = 302;
    res.setHeader('Location', `/#/r/${code.toUpperCase()}`);
    res.end();
  };
  return {
    name: 'crassecadia-invite-links',
    configureServer: (server) => void server.middlewares.use(middleware),
    configurePreviewServer: (server) => void server.middlewares.use(middleware),
  };
}

export default defineConfig({
  // Chemins relatifs obligatoires pour le proxy des Discord Activities (§16.2).
  base: './',
  plugins: [svelte(), inviteLinks()],
  server: { port: 5173 },
});
