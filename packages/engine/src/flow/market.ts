/**
 * Marché : reroll automatique et manuel (§6.2), regarnissage (§6.9).
 */
import { poolShapeCount, poolTotal, poolWithout } from '../core/pool.ts';
import type { MarketSlot, Pool, ShapeId } from '../core/types.ts';
import type { DrawSession } from './draws.ts';

/** Nombre maximal de tirages du reroll automatique avant le tirage construit (§6.2). */
export const AUTO_REROLL_MAX_ATTEMPTS = 100;

function allSame(shapes: readonly (ShapeId | null)[]): boolean {
  return shapes.length > 0 && shapes.every((s) => s !== null && s === shapes[0]);
}

export function marketTokens(market: readonly MarketSlot[]): (ShapeId | null)[] {
  return market.map((s) => s.token);
}

/**
 * Reroll automatique applicable (§6.2) : les `m ≥ 2` jetons sont identiques, et la pool (les jetons
 * remplacés étant mis de côté) permet un tirage différent : au moins `m` jetons et 2 formes.
 */
export function canAutoReroll(market: readonly MarketSlot[], pool: Pool): boolean {
  const m = market.length;
  return (
    m >= 2 && allSame(marketTokens(market)) && poolTotal(pool) >= m && poolShapeCount(pool) >= 2
  );
}

/**
 * Emplacements relancés par le reroll manuel (§6.2) : exactement `m − 1` jetons identiques, avec
 * `m ≥ 3`. Retourne `null` si le reroll manuel n'est pas proposé.
 */
export function manualRerollSlots(market: readonly MarketSlot[]): number[] | null {
  const m = market.length;
  if (m < 3) return null;
  const tokens = marketTokens(market);
  if (tokens.some((t) => t === null)) return null;
  const counts = new Map<ShapeId, number>();
  for (const t of tokens) counts.set(t!, (counts.get(t!) ?? 0) + 1);
  for (const [shape, n] of counts) {
    if (n === m - 1) return tokens.flatMap((t, i) => (t === shape ? [i] : []));
  }
  return null;
}

/** Le reroll manuel peut-il être tiré : assez de jetons dans la pool pour remplacer `m − 1` ? */
export function canManualReroll(market: readonly MarketSlot[], pool: Pool): boolean {
  const slots = manualRerollSlots(market);
  return slots !== null && poolTotal(pool) >= slots.length;
}

/**
 * Reroll automatique (§6.2). Les jetons remplacés sont mis de côté pendant le tirage, puis remis
 * dans la pool. Un tirage de `m` identiques est remis dans la pool et recommencé, jusqu'à
 * 100 essais ; au-delà, le dernier jeton est tiré parmi les autres formes.
 * Précondition : `canAutoReroll(market, session.pool)`.
 */
export function autoReroll(market: readonly MarketSlot[], session: DrawSession): MarketSlot[] {
  const m = market.length;
  const setAside = marketTokens(market) as ShapeId[];
  let drawn: ShapeId[] | null = null;
  for (let attempt = 0; attempt < AUTO_REROLL_MAX_ATTEMPTS && drawn === null; attempt++) {
    const attemptDraw: ShapeId[] = [];
    for (let i = 0; i < m; i++) attemptDraw.push(session.drawToken()!);
    if (allSame(attemptDraw)) {
      for (const s of attemptDraw) session.returnToken(s);
    } else {
      drawn = attemptDraw;
    }
  }
  if (drawn === null) {
    drawn = [];
    for (let i = 0; i < m - 1; i++) drawn.push(session.drawToken()!);
    const last = allSame(drawn)
      ? session.drawToken(poolWithout(session.pool, drawn[0]!))
      : session.drawToken();
    drawn.push(last!);
  }
  for (const s of setAside) session.returnToken(s);
  return market.map((slot, i) => ({ ...slot, token: drawn[i]! }));
}

/**
 * Reroll manuel (§6.2) : relance les `m − 1` jetons identiques, le jeton différent est conservé.
 * Précondition : `canManualReroll(market, session.pool)`.
 */
export function manualReroll(market: readonly MarketSlot[], session: DrawSession): MarketSlot[] {
  const slots = manualRerollSlots(market)!;
  const next = market.slice();
  for (const i of slots) next[i] = { ...next[i]!, token: session.drawToken() };
  for (const i of slots) session.returnToken(market[i]!.token!);
  return next;
}

/** Choix du jeton au moment de la confirmation (§6.4). */
export type TokenTaken =
  | { readonly kind: 'associated' }
  | { readonly kind: 'joker'; readonly slot: number }
  | { readonly kind: 'none' };

/**
 * Regarnissage à la confirmation (§6.4, §6.9). Ordre des tirages : la tuile de l'emplacement
 * choisi, puis le jeton à remplacer.
 */
export function refillMarket(
  market: readonly MarketSlot[],
  slot: number,
  taken: TokenTaken,
  session: DrawSession,
): { market: MarketSlot[]; slots: number[] } {
  const next = market.slice();
  if (taken.kind === 'none') {
    const returned = market[slot]!.token;
    if (returned !== null) session.returnToken(returned);
  }
  const tile = session.drawTile();
  if (taken.kind === 'joker') {
    next[slot] = { ...next[slot]!, tile };
    next[taken.slot] = { ...next[taken.slot]!, token: session.drawToken() };
    return { market: next, slots: [slot, taken.slot].sort((a, b) => a - b) };
  }
  next[slot] = { tile, token: session.drawToken() };
  return { market: next, slots: [slot] };
}
