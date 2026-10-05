import { type Browser, expect, type Page, test } from '@playwright/test';
import { CI_STORAGE } from './ci.ts';
import { playStep, uiState } from './play.ts';

async function newPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 860 },
    storageState: CI_STORAGE,
  });
  return context.newPage();
}

async function openOnline(page: Page, name: string) {
  await page.goto('/');
  await page.getByRole('button', { name: /Jouer en ligne|Play online/ }).click();
  await page.getByLabel(/^\s*(Pseudo|Nickname)\s*$/).fill(name);
}

/**
 * Phase 6 (§21) : salon protégé configuré par l'hôte (§12.4), trouvé dans le navigateur de salons
 * (§12.3), rejoint avec son mot de passe, partie avec des bots et un spectateur.
 */
test('salon personnalisé : navigateur, mot de passe, paramètres, bots et spectateur', async ({
  browser,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'le test ouvre lui-même ses navigateurs');
  test.setTimeout(180_000);
  const [host, guest, watcher] = await Promise.all([0, 1, 2].map(() => newPage(browser)));
  const errors: string[] = [];
  for (const p of [host!, guest!, watcher!]) p.on('pageerror', (e) => errors.push(e.message));
  const roomName = `E2E ${Date.now() % 100000}`;

  // Création d'un salon protégé.
  await openOnline(host!, 'Hôte');
  await host!.getByLabel(/^\s*(Nom du salon|Room name)\s*$/).fill(roomName);
  await host!
    .getByRole('combobox', { name: /^(Visibilité|Visibility)$/ })
    .selectOption('protected');
  await host!.getByLabel(/^\s*(Mot de passe|Password)\s*$/).fill('sesame');
  await host!.getByRole('button', { name: /Créer le salon|Create room/ }).click();
  await expect(host!.getByTestId('room-code')).toBeVisible();

  // Paramètres du §12.4 : 5 sièges dont 3 bots, 1 manche, spectateurs autorisés, Tier A partout.
  await host!.getByRole('button', { name: /Initiation/ }).click();
  await host!
    .getByRole('spinbutton', { name: /^(Sièges \(humains \+ bots\)|Seats \(humans \+ bots\))$/ })
    .fill('5');
  await host!
    .getByRole('spinbutton', { name: /^(Sièges \(humains \+ bots\)|Seats \(humans \+ bots\))$/ })
    .press('Tab');
  await expect(host!.getByRole('spinbutton', { name: /^Bots$/ })).toBeEnabled();
  await host!.getByRole('spinbutton', { name: /^Bots$/ }).fill('3');
  await host!.getByRole('spinbutton', { name: /^Bots$/ }).press('Tab');
  await host!.getByRole('spinbutton', { name: /^(Manches|Rounds)$/ }).fill('1');
  await host!.getByRole('spinbutton', { name: /^(Manches|Rounds)$/ }).press('Tab');
  await host!.getByLabel(/Spectateurs autorisés|Spectators allowed/).check();
  await expect(host!.getByText('Bot 3')).toBeVisible();

  // Le salon apparaît dans le navigateur ; la recherche le retrouve ; le mot de passe est demandé.
  await openOnline(guest!, 'Invité');
  await guest!.getByRole('searchbox').fill(roomName);
  const row = guest!.locator('tr', { hasText: roomName });
  await expect(row).toBeVisible();
  await expect(row).toContainText('A');
  await row.getByRole('button', { name: /^(Rejoindre|Join)$/ }).click();
  await guest!.getByLabel(/^\s*(Mot de passe|Password)\s*$/).fill('mauvais');
  await guest!
    .locator('form.password')
    .getByRole('button', { name: /^(Rejoindre|Join)$/ })
    .click();
  await expect(guest!.getByRole('alert')).toContainText(/incorrect|Wrong/);
  await row.getByRole('button', { name: /^(Rejoindre|Join)$/ }).click();
  await guest!.getByLabel(/^\s*(Mot de passe|Password)\s*$/).fill('sesame');
  await guest!
    .locator('form.password')
    .getByRole('button', { name: /^(Rejoindre|Join)$/ })
    .click();
  await expect(guest!.getByTestId('room-code')).toBeVisible();
  // Les paramètres du serveur sont visibles mais pas modifiables par un invité.
  await expect(guest!.getByRole('spinbutton', { name: /^(Manches|Rounds)$/ })).toBeDisabled();
  await expect(guest!.getByRole('spinbutton', { name: /^(Manches|Rounds)$/ })).toHaveValue('1');
  await expect(guest!.getByRole('spinbutton', { name: /^Bots$/ })).toHaveValue('3');
  await guest!.screenshot({ path: 'e2e/.results/custom-1-guest-lobby.png', fullPage: true });
  // Chat de la salle d'attente (§11.2).
  await host!.getByRole('textbox', { name: /^(Message)$/ }).fill('Bienvenue !');
  await host!.getByRole('textbox', { name: /^(Message)$/ }).press('Enter');
  await expect(guest!.getByRole('region', { name: 'Chat' })).toContainText('Bienvenue !');

  await host!.getByRole('button', { name: /Lancer la partie|Start game/ }).click();
  for (const p of [host!, guest!]) await expect(p.locator('canvas')).toBeVisible();

  // Un spectateur regarde la partie en cours depuis le navigateur.
  await openOnline(watcher!, 'Curieux');
  await watcher!.getByRole('searchbox').fill(roomName);
  await watcher!
    .locator('tr', { hasText: roomName })
    .getByRole('button', { name: /Regarder|Watch/ })
    .click();
  await watcher!.getByLabel(/^\s*(Mot de passe|Password)\s*$/).fill('sesame');
  await watcher!
    .locator('form.password')
    .getByRole('button', { name: /^(Rejoindre|Join)$/ })
    .click();
  await expect(watcher!.locator('canvas')).toBeVisible();

  for (let guard = 0; guard < 1500; guard++) {
    const states = await Promise.all([host!, guest!].map(uiState));
    if (states.every((s) => s.phase === 'ended')) break;
    // Le spectateur ne peut jamais agir.
    expect((await uiState(watcher!)).canAct).toBe(false);
    let acted = false;
    for (const p of [host!, guest!]) acted = (await playStep(p)) || acted;
    if (!acted) await host!.waitForTimeout(150);
  }
  for (const p of [host!, guest!, watcher!]) {
    await expect(p.getByRole('dialog')).toContainText(/Fin de partie|Game over/);
  }
  await watcher!.screenshot({ path: 'e2e/.results/custom-2-spectator-end.png' });
  expect(errors).toEqual([]);
});
