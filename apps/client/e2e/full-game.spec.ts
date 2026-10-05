import { expect, test } from '@playwright/test';
import { playStep, uiState } from './play.ts';

/** Partie complète en 2 manches contre un bot, jouée par l'interface jusqu'à l'écran de fin. */
test('partie complète jusqu’à l’écran de fin', async ({ page }, info) => {
  // Une centaine de coups joués par l'interface : plus d'une minute sur la CI, sans GPU.
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: /hors-ligne|offline/i }).click();
  await page.locator('input[type=range]').first().fill('2');
  await page.getByRole('button', { name: /Lancer|Start/ }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Confirmer|Confirm/ })
    .click();

  for (let guard = 0; guard < 400; guard++) {
    const s = await uiState(page);
    if (s.phase === 'ended') break;
    if (!(await playStep(page))) await page.waitForTimeout(150);
  }

  await expect(page.getByRole('dialog')).toContainText(/Fin de partie|Game over/);
  await page.screenshot({ path: `e2e/.results/${info.project.name}-4-end.png` });
  expect(errors).toEqual([]);
});
