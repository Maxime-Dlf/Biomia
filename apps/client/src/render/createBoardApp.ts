import { Application } from 'pixi.js';
import { BOARD_BACKGROUND } from './palette.ts';

/**
 * Crée l'application PixiJS du plateau (§14.1) : WebGL2 par défaut pour la compatibilité
 * maximale (webviews Discord comprises). `renderScale` applique l'échelle de rendu (§14.3).
 */
export async function createBoardApp(
  container: HTMLElement,
  renderScale = 1,
): Promise<Application> {
  const app = new Application();
  await app.init({
    preference: 'webgl',
    resizeTo: container,
    background: BOARD_BACKGROUND,
    antialias: true,
    autoDensity: true,
    resolution: (window.devicePixelRatio || 1) * renderScale,
  });
  container.appendChild(app.canvas);
  return app;
}
