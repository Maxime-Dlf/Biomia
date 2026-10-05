import { expect, test } from '@playwright/test';
import { uiState } from './play.ts';

/** §13.6 : le plateau se joue aussi au clavier (flèches pour choisir la cellule, Entrée pour poser). */
test('pose de la tuile de départ au clavier', async ({ page, isMobile }) => {
  test.skip(isMobile, 'clavier : bureau');
  await page.goto('/');
  await page.getByRole('button', { name: /hors-ligne|offline/i }).click();
  await page.getByRole('button', { name: /Lancer|Start/ }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Confirmer|Confirm/ })
    .click();
  await expect
    .poll(async () => (await uiState(page)).phase, { timeout: 10_000 })
    .toBe('startTiles');
  // Attendre que ce soit au joueur humain de poser sa tuile de départ.
  await expect.poll(async () => (await uiState(page)).canAct, { timeout: 10_000 }).toBe(true);
  const before = await uiState(page);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await uiState(page)).key).not.toBe(before.key);
});
