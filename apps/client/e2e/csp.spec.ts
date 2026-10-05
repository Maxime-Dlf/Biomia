import { expect, test } from '@playwright/test';

/**
 * §16.2 : le build de production fonctionne sous la CSP stricte du site et du proxy Discord
 * (aucun `eval`, aucune ressource tierce). Servi par `vite preview` avec les mêmes en-têtes.
 */
test('le plateau démarre sous la CSP de production', async ({ page, isMobile }) => {
  test.skip(isMobile, 'une seule vérification suffit');
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  const response = await page.goto('http://localhost:5198/');
  expect(response?.headers()['content-security-policy']).toContain("script-src 'self'");
  await page.getByRole('button', { name: /hors-ligne|offline/i }).click();
  await page.getByRole('button', { name: /Lancer|Start/ }).click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1000);
  expect(errors).toEqual([]);
});
