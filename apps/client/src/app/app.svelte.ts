/**
 * Navigation entre les écrans (§13.1) : accueil, configuration hors-ligne, jeu en ligne (création,
 * salle d'attente), jeu, paramètres.
 */
import type { NetworkDriver } from '../game/network-driver.ts';
import type { GameSession } from '../game/session.svelte.ts';
import type { Platform } from '../platform/platform.ts';
import { webPlatform } from '../platform/web.ts';

export type Screen =
  | { readonly name: 'home' }
  | { readonly name: 'setup' }
  | { readonly name: 'online'; readonly error?: string; readonly code?: string }
  | { readonly name: 'resuming' }
  | { readonly name: 'legal' }
  | { readonly name: 'lobby'; readonly driver: NetworkDriver }
  | { readonly name: 'game'; readonly session: GameSession };

export const app: { screen: Screen; settingsOpen: boolean; platform: Platform } = $state({
  screen: { name: 'home' },
  settingsOpen: false,
  // Remplacée au démarrage par l'adaptateur Discord dans une Activity (§16.1).
  platform: webPlatform(),
});

export function goto(screen: Screen): void {
  const current = app.screen;
  if (current.name === 'game' && (screen.name !== 'game' || screen.session !== current.session)) {
    current.session.dispose();
  }
  // La salle d'attente passe son pilote à la session de jeu ; sinon on quitte le salon.
  if (
    current.name === 'lobby' &&
    !(screen.name === 'lobby' && screen.driver === current.driver) &&
    !(screen.name === 'game' && screen.session.driver === current.driver)
  ) {
    current.driver.dispose();
  }
  app.screen = screen;
}
