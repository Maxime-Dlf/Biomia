import { expect, test } from '@playwright/test';

/** Partie hors-ligne : accueil → configuration → objectifs → tuile de départ → premier tour. */
test('partie hors-ligne contre un bot', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: /hors-ligne|offline/i }).click();
  await page.getByRole('button', { name: /Lancer|Start/ }).click();

  // Tirage initial des objectifs : on garde la proposition par défaut.
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.screenshot({ path: `e2e/.results/${info.project.name}-1-objectives.png` });
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Confirmer|Confirm/ })
    .click();

  // Pose de la tuile de départ, si c'est au joueur humain (sinon le bot pose la sienne d'abord).
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `e2e/.results/${info.project.name}-2-start.png` });
  const box = (await canvas.boundingBox())!;
  for (let attempt = 0; attempt < 30; attempt++) {
    if ((await page.getByText(/Choisissez une tuile|Pick a tile/).count()) > 0) break;
    const x = box.x + box.width / 2 + ((attempt % 6) - 3) * 60;
    const y = box.y + box.height / 2 + (Math.floor(attempt / 6) - 2) * 50;
    await page.mouse.click(x, y);
    await page.waitForTimeout(400);
  }
  await page.screenshot({ path: `e2e/.results/${info.project.name}-3-turn.png` });
  expect(errors).toEqual([]);
});
