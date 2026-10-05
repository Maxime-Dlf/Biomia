/**
 * Jouer par l'interface (tests de bout en bout) : chaque étape passe par de vrais clics, la
 * passerelle de développement `window.__crassecadia` ne sert qu'à lire l'état et à trouver la
 * position écran des cellules légales.
 */
import type { Page } from '@playwright/test';

type Hook = {
  session: {
    canAct: boolean;
    step: string | null;
    state: { phase: string; turnIndex: number; startIndex: number; turn: { slot: number } | null };
    tileTargets: { q: number; r: number }[];
    tokenTargets: { q: number; r: number }[];
    startTargets: { q: number; r: number; orientation: number }[];
    rotation: number;
    placeable: boolean[];
    viewerSeat: string;
  };
  cellToScreen(q: number, r: number): { x: number; y: number };
};

export interface UiState {
  readonly ready: boolean;
  readonly canAct: boolean;
  readonly step: string | null;
  readonly phase: string;
  readonly key: string;
  readonly seat: string;
}

/** État lu par la passerelle ; `ready` est faux tant que l'écran de jeu n'est pas monté. */
export function uiState(page: Page): Promise<UiState> {
  return page.evaluate(() => {
    const h = (window as unknown as { __crassecadia?: Hook }).__crassecadia;
    if (!h) return { ready: false, canAct: false, step: null, phase: '', key: '', seat: '' };
    const s = h.session;
    const st = s.state;
    return {
      ready: true,
      canAct: s.canAct,
      step: s.step,
      phase: st.phase,
      key: `${st.phase}:${st.turnIndex}:${st.startIndex}:${s.step}`,
      seat: s.viewerSeat,
    };
  });
}

/** Position écran de la première cellule candidate visible (non couverte par le HUD). */
function visibleCell(page: Page, source: string) {
  return page.evaluate(
    ([src]) => {
      const h = (window as unknown as { __crassecadia: Hook }).__crassecadia;
      const cells = new Function('h', `return (${src})(h)`)(h) as { q: number; r: number }[];
      for (const cell of cells) {
        const p = h.cellToScreen(cell.q, cell.r);
        if (document.elementFromPoint(p.x, p.y)?.tagName === 'CANVAS') return p;
      }
      return null;
    },
    [source],
  );
}

/** Clique sur une cellule candidate ; si aucune n'est visible, recentre puis dézoome. */
async function clickCell(page: Page, pick: (h: Hook) => { q: number; r: number }[]) {
  const source = pick.toString();
  for (let attempt = 0; attempt < 4; attempt++) {
    const pos = await visibleCell(page, source);
    if (pos) {
      await page.mouse.click(pos.x, pos.y);
      return;
    }
    if (attempt === 0) await page.keyboard.press(' ');
    else {
      const size = page.viewportSize()!;
      await page.mouse.move(size.width / 2, size.height / 2);
      await page.keyboard.down('Control');
      await page.mouse.wheel(0, 600);
      await page.keyboard.up('Control');
    }
    await page.waitForTimeout(150);
  }
  const detail = await page.evaluate(
    ([src]) => {
      const h = (window as unknown as { __crassecadia: Hook }).__crassecadia;
      const cells = new Function('h', `return (${src})(h)`)(h) as { q: number; r: number }[];
      return cells.slice(0, 4).map((c) => {
        const p = h.cellToScreen(c.q, c.r);
        const el = document.elementFromPoint(p.x, p.y);
        return `${c.q},${c.r}→${Math.round(p.x)},${Math.round(p.y)} ${el?.tagName}.${el?.className}`;
      });
    },
    [source],
  );
  throw new Error(
    `aucune cellule légale visible : ${detail.join(' | ')} (${page.viewportSize()?.width}×${page.viewportSize()?.height})`,
  );
}

/**
 * Joue une étape si la page peut agir. Retourne `false` si elle n'a rien fait (pas son tour,
 * écran pas prêt, partie finie).
 */
export async function playStep(page: Page): Promise<boolean> {
  const s = await uiState(page);
  if (!s.ready || !s.canAct || s.phase === 'ended') return false;
  const vote = page.getByRole('dialog').getByRole('button', { name: /^(Confirmer|Confirm)$/ });
  if (s.phase === 'objectives' || (await vote.count()) > 0) {
    if ((await vote.count()) === 0) return false;
    await vote.click();
  } else if (s.phase === 'startTiles') {
    // Une orientation dont une position légale est visible, sinon recentrage et dézoom.
    const pick = (h: Hook) =>
      h.session.startTargets.filter((a) => a.orientation === h.session.rotation);
    let placed = false;
    for (let turn = 0; turn < 6 && !placed; turn++) {
      const pos = await visibleCell(page, pick.toString());
      if (pos) {
        await page.mouse.click(pos.x, pos.y);
        placed = true;
      } else await page.keyboard.press('r');
    }
    if (!placed) await clickCell(page, pick);
  } else if (s.step === 'chooseTile') {
    await page.getByRole('button', { name: 'tuile 1' }).click();
  } else if (s.step === 'placeTile') {
    await clickCell(page, (h) => h.session.tileTargets);
  } else if (s.step === 'chooseToken') {
    const own = await page.evaluate(() => {
      const s2 = (window as unknown as { __crassecadia: Hook }).__crassecadia.session;
      return s2.placeable[s2.state.turn!.slot] ?? false;
    });
    if (own) await page.locator('.slot.chosen button.token').click();
    else await page.getByRole('button', { name: /Aucun jeton|No token/ }).click();
  } else if (s.step === 'placeToken') {
    await clickCell(page, (h) => h.session.tokenTargets);
  } else if (s.step === 'confirm') {
    await page.getByRole('button', { name: /^(Confirmer|Confirm)$/ }).click();
  } else {
    return false;
  }
  // Attend que l'action soit prise en compte (immédiat en local, aller-retour serveur en ligne).
  for (let i = 0; i < 60; i++) {
    const after = await uiState(page);
    if (after.key !== s.key || !after.canAct) break;
    await page.waitForTimeout(50);
  }
  return true;
}
