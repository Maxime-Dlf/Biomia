import { defineConfig, devices } from '@playwright/test';

const SERVER_PORT = 2599;

/** Tests de bout en bout du client (§20.1) : parties hors-ligne et en ligne dans de vrais navigateurs. */
export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/.results',
  // Captures de référence sans suffixe de plateforme : le rendu du canvas est logiciel en
  // navigateur sans tête, donc comparable d'un système à l'autre (tolérance par capture).
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:5199',
    viewport: { width: 1400, height: 860 },
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 860 } },
    },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: 'pnpm vite --port 5199 --strictPort',
      url: 'http://localhost:5199',
      reuseExistingServer: true,
      timeout: 60_000,
      env: { VITE_SERVER_URL: `ws://localhost:${SERVER_PORT}` },
    },
    {
      // Serveur autoritaire pour les parties en ligne (phase 5).
      command: 'pnpm --dir ../server start',
      port: SERVER_PORT,
      reuseExistingServer: true,
      timeout: 60_000,
      env: { PORT: String(SERVER_PORT) },
    },
  ],
});
