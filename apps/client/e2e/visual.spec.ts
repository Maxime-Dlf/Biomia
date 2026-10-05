import { expect, type Page, test } from '@playwright/test';

/**
 * Phase 9 (§21) : non-régression visuelle des trois profils (§14.3) sur une scène fixe, et mesure
 * des FPS sur un plateau de 1 000 tuiles (§20.2). Scènes de développement : `?scene=…`.
 */

async function openScene(page: Page, scene: string, profile: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/?scene=${scene}&profile=${profile}&time=12&particles=0`);
  // La scène de 1 000 tuiles est générée dans la page : plusieurs secondes sans GPU (CI).
  await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 });
  // Quelques images pour que le plateau soit dessiné et recentré.
  await page.waitForTimeout(600);
  return errors;
}

/** Images affichées par seconde, mesurées dans la page pendant `ms`. */
function measureFps(page: Page, ms: number): Promise<number> {
  return page.evaluate(
    (duration) =>
      new Promise<number>((resolve) => {
        let frames = 0;
        const start = performance.now();
        const step = (now: number) => {
          frames++;
          if (now - start < duration) requestAnimationFrame(step);
          else resolve((frames * 1000) / (now - start));
        };
        requestAnimationFrame(step);
      }),
    ms,
  );
}

test.describe('§14.3 profils graphiques', () => {
  test.skip(({ isMobile }) => isMobile, 'captures de bureau');
  // Références générées sur le poste de développement ; en CI (Linux, rendu logiciel), elles
  // devront être régénérées sur cette plateforme avant d'être comparées.
  test.skip(!!process.env.CI, 'références visuelles propres à la plateforme');

  for (const profile of ['ultra-low', 'low', 'normal']) {
    test(`capture de référence — ${profile}`, async ({ page }) => {
      const errors = await openScene(page, 'board', profile);
      // Seul le plateau est comparé : l'interface DOM dépend des polices du système.
      await page.addStyleTag({ content: '.hud, .preview { display: none !important; }' });
      await expect(page.locator('canvas')).toHaveScreenshot(`board-${profile}.png`, {
        maxDiffPixelRatio: 0.01,
      });
      // Aucun shader en échec, aucune erreur de rendu.
      expect(errors).toEqual([]);
    });
  }
});

test.describe('§20.2 budgets de FPS', () => {
  test.skip(({ isMobile }) => isMobile, 'mesure de bureau');

  test('plateau de 1 000 tuiles', async ({ page }) => {
    const errors = await openScene(page, 'large', 'ultra-low');
    const ultraLow = await measureFps(page, 3000);
    const normal = await (async () => {
      await openScene(page, 'large', 'normal');
      return measureFps(page, 3000);
    })();
    test.info().annotations.push({
      type: 'fps',
      description: `Ultra Low ${ultraLow.toFixed(0)} FPS, Normal ${normal.toFixed(0)} FPS`,
    });
    console.log(
      `FPS (1 000 tuiles) : Ultra Low ${ultraLow.toFixed(1)}, Normal ${normal.toFixed(1)}`,
    );
    // Le budget visé est 60 FPS ; en CI (sans GPU), la mesure est seulement relevée.
    if (!process.env.CI) expect(ultraLow).toBeGreaterThan(30);
    expect(errors).toEqual([]);
  });
});
