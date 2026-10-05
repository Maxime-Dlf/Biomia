import { type Browser, devices, expect, type Page, test } from '@playwright/test';
import { CI_STORAGE } from './ci.ts';
import { playStep, uiState } from './play.ts';

/** Crée une page dans un contexte isolé (sessionStorage propre), bureau ou mobile. */
async function newPlayer(browser: Browser, mobile: boolean): Promise<Page> {
  const context = await browser.newContext({
    ...(mobile ? devices['Pixel 7'] : { viewport: { width: 1280, height: 800 } }),
    storageState: CI_STORAGE,
  });
  return context.newPage();
}

/**
 * Phase 5 (§21) : partie complète entre 4 navigateurs (dont un mobile) ; un F5 en cours de partie
 * ne fait pas perdre la partie.
 */
test('partie en ligne complète entre 4 navigateurs, avec un F5 en cours de partie', async ({
  browser,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'le test ouvre lui-même ses 4 navigateurs');
  test.setTimeout(240_000);
  const pages = await Promise.all([0, 1, 2, 3].map((i) => newPlayer(browser, i === 3)));
  const errors: string[] = [];
  pages.forEach((p, i) => {
    p.on('pageerror', (e) => errors.push(`J${i + 1}: ${e.message}`));
  });

  // L'hôte crée le salon puis le configure : 4 sièges humains (défaut), 2 manches.
  const host = pages[0]!;
  await host.goto('/');
  await host.getByRole('button', { name: /Jouer en ligne|Play online/ }).click();
  await host.getByLabel(/^\s*(Pseudo|Nickname)\s*$/).fill('Hôte');
  await host.getByRole('button', { name: /Créer le salon|Create room/ }).click();
  const code = (await host.getByTestId('room-code').textContent())!.trim();
  expect(code).toMatch(/^[A-Z0-9]{6}$/);
  // Le champ numérique envoie sa valeur à la validation de la saisie (perte de focus).
  await host.getByRole('spinbutton', { name: /^(Manches|Rounds)$/ }).fill('2');
  await host.getByRole('spinbutton', { name: /^(Manches|Rounds)$/ }).press('Tab');

  // Les autres rejoignent par le lien d'invitation (§16.3).
  for (const [i, page] of pages.slice(1).entries()) {
    await page.goto(`/r/${code}`);
    await page.getByLabel(/^\s*(Pseudo|Nickname)\s*$/).fill(`Joueur ${i + 2}`);
    await page.getByTestId('join-code').click();
    await expect(page.getByTestId('room-code')).toHaveText(code);
    // L'invité voit les paramètres du serveur, en lecture seule.
    await expect(page.getByRole('spinbutton', { name: /^(Manches|Rounds)$/ })).toHaveValue('2');
  }
  await expect(host.getByText(/Joueurs \(4 \/ 4\)|Players \(4 \/ 4\)/)).toBeVisible();
  await host.screenshot({ path: 'e2e/.results/online-1-lobby.png' });
  await host.getByRole('button', { name: /Lancer la partie|Start game/ }).click();
  for (const page of pages) await expect(page.locator('canvas')).toBeVisible();

  let reloaded = false;
  for (let guard = 0; guard < 2000; guard++) {
    const states = await Promise.all(pages.map(uiState));
    if (states.every((s) => s.phase === 'ended')) break;
    // F5 au milieu de la partie, pendant le tour d'un autre joueur.
    if (!reloaded && states[1]!.phase === 'playing' && !states[1]!.canAct) {
      const seat = states[1]!.seat;
      await pages[1]!.reload();
      await expect(pages[1]!.locator('canvas')).toBeVisible({ timeout: 20_000 });
      await expect.poll(async () => (await uiState(pages[1]!)).seat).toBe(seat);
      await pages[1]!.screenshot({ path: 'e2e/.results/online-2-after-reload.png' });
      reloaded = true;
      continue;
    }
    let acted = false;
    for (const page of pages) acted = (await playStep(page)) || acted;
    if (!acted) await host.waitForTimeout(100);
  }
  expect(reloaded).toBe(true);
  for (const [i, page] of pages.entries()) {
    await expect(page.getByRole('dialog')).toContainText(/Fin de partie|Game over/);
    await page.screenshot({ path: `e2e/.results/online-3-end-${i + 1}.png` });
  }
  expect(errors).toEqual([]);
});
