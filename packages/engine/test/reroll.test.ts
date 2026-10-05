import { describe, expect, it } from 'vitest';
import {
  AUTO_REROLL_MAX_ATTEMPTS,
  activeSeat,
  applyAction,
  type DrawSource,
  type GameState,
  getLegalActions,
  type MarketSlot,
  marketTokens,
  type Pool,
  poolTotal,
  type ShapeId,
} from '../src/index.ts';
import { apply, readyGame, SHAPES } from './helpers/fixtures.ts';

const [X, Y, Z] = SHAPES as [ShapeId, ShapeId, ShapeId];

/** Source qui tire la pioche dans l'ordre et les jetons selon un script (repli : forme `X`). */
function scripted(tokens: readonly ShapeId[] = []): DrawSource & { count: () => number } {
  let i = 0;
  return {
    tile: (deck, pos) => deck[pos] ?? null,
    token: (available: Pool) => {
      const want = tokens[i] ?? X;
      i++;
      if ((available[want] ?? 0) > 0) return want;
      return Object.keys(available).find((s) => available[s]! > 0) ?? null;
    },
    rngState: (p) => p,
    count: () => i,
  };
}

/** Remplace les jetons du marché en conservant le total de jetons via la pool. */
function setTokens(state: GameState, tokens: readonly ShapeId[]): GameState {
  const pool: Record<string, number> = { ...state.pool };
  for (const s of state.market) if (s.token) pool[s.token]! += 1;
  const market: MarketSlot[] = state.market.map((s, i) => ({ ...s, token: tokens[i]! }));
  for (const t of tokens) pool[t]! -= 1;
  return { ...state, market, pool };
}

function total(state: GameState): number {
  return (
    poolTotal(state.pool) + marketTokens(state.market).filter(Boolean).length + state.tokens.size
  );
}

/** Joue « aucun jeton » sur l'emplacement `slot` et confirme avec la source donnée. */
function playNoToken(state: GameState, slot: number, source: DrawSource) {
  const seat = activeSeat(state)!;
  let s = apply(state, { type: 'chooseTile', seat, slot });
  const p = getLegalActions(s, seat).find((a) => a.type === 'placeTile')!;
  s = apply(s, p);
  s = apply(s, { type: 'chooseToken', seat, slot: null });
  const res = applyAction(s, { type: 'confirm', seat }, source);
  if (!res.ok) throw new Error(res.reason);
  return res;
}

describe('§6.2 Reroll automatique', () => {
  it('m jetons identiques au début du tour → relancés sans demander, jetons conservés', () => {
    const s = setTokens(readyGame(), [X, X, X, Y]);
    const before = total(s);
    // « aucun jeton » sur l'emplacement 3 : Y retourne dans la pool, puis X est tiré → 4 X.
    // Au début du tour suivant : 1er tirage 4 X (recommencé), 2e tirage X Y Z X.
    const res = playNoToken(s, 3, scripted([X, X, X, X, X, X, Y, Z, X]));
    expect(marketTokens(res.state.market)).toEqual([X, Y, Z, X]);
    const reroll = res.events.find((e) => e.type === 'Rerolled');
    expect(reroll).toMatchObject({ mode: 'auto', before: [X, X, X, X], after: [X, Y, Z, X] });
    expect(total(res.state)).toBe(before);
  });

  it('au-delà de 100 essais : tirage construit avec au moins 2 formes', () => {
    const s = setTokens(readyGame(), [X, X, X, Y]);
    const source = scripted();
    const res = playNoToken(s, 3, source);
    const tokens = marketTokens(res.state.market);
    expect(new Set(tokens).size).toBeGreaterThanOrEqual(2);
    // 1 jeton au regarnissage + 100 essais de 4 + tirage construit de 4.
    expect(source.count()).toBe(1 + AUTO_REROLL_MAX_ATTEMPTS * 4 + 4);
  });

  it('anti-boucle : pool sans 2 formes différentes → reroll automatique désactivé', () => {
    let s = setTokens(readyGame(), [X, X, X, X]);
    // La pool ne contient plus que des X.
    const pool: Record<string, number> = {};
    for (const shape of SHAPES) pool[shape] = 0;
    pool[X] = 50;
    s = { ...s, pool };
    const res = playNoToken(s, 3, scripted([X]));
    expect(marketTokens(res.state.market)).toEqual([X, X, X, X]);
    expect(res.events.some((e) => e.type === 'Rerolled')).toBe(false);
  });

  it('désactivable en custom', () => {
    const s = setTokens(readyGame({ options: { autoReroll: false } }), [X, X, X, Y]);
    const res = playNoToken(s, 3, scripted([X]));
    expect(marketTokens(res.state.market)).toEqual([X, X, X, X]);
  });

  it('marché de 2 emplacements : reroll automatique si les 2 jetons sont identiques', () => {
    const s = setTokens(readyGame({ marketSize: 2 }), [X, Y]);
    const res = playNoToken(s, 1, scripted([X, Y, Z]));
    expect(marketTokens(res.state.market)).toEqual([Y, Z]);
  });
});

describe('§6.2 Reroll manuel', () => {
  it('exactement m − 1 identiques → bouton ; relance les m − 1, conserve le différent', () => {
    let s = setTokens(readyGame(), [X, Y, X, X]);
    const seat = activeSeat(s)!;
    expect(getLegalActions(s, seat).some((a) => a.type === 'reroll')).toBe(true);
    const before = total(s);
    const res = applyAction(s, { type: 'reroll', seat }, scripted([Z, Y, Z]));
    if (!res.ok) throw new Error(res.reason);
    s = res.state;
    expect(marketTokens(s.market)).toEqual([Z, Y, Y, Z]);
    expect(total(s)).toBe(before);
    expect(s.turn!.manualRerollUsed).toBe(true);
  });

  it('1 seul reroll manuel par tour, même si le résultat redonne m − 1 identiques', () => {
    let s = setTokens(readyGame(), [X, Y, X, X]);
    const seat = activeSeat(s)!;
    const res = applyAction(s, { type: 'reroll', seat }, scripted([Z, Z, Z]));
    if (!res.ok) throw new Error(res.reason);
    s = res.state;
    expect(marketTokens(s.market)).toEqual([Z, Y, Z, Z]);
    expect(applyAction(s, { type: 'reroll', seat })).toEqual({
      ok: false,
      reason: 'manual-reroll-already-used',
    });
  });

  it('résultat de m identiques : laissé tel quel, sans reroll automatique', () => {
    const s = setTokens(readyGame(), [X, Y, X, X]);
    const seat = activeSeat(s)!;
    const res = applyAction(s, { type: 'reroll', seat }, scripted([Y, Y, Y]));
    if (!res.ok) throw new Error(res.reason);
    expect(marketTokens(res.state.market)).toEqual([Y, Y, Y, Y]);
    expect(res.events.filter((e) => e.type === 'Rerolled')).toHaveLength(1);
  });

  it('disponible jusqu’au choix du jeton, pas après', () => {
    let s = setTokens(readyGame(), [X, Y, X, X]);
    const seat = activeSeat(s)!;
    s = apply(s, { type: 'chooseTile', seat, slot: 1 });
    expect(getLegalActions(s, seat).some((a) => a.type === 'reroll')).toBe(true);
    s = apply(s, getLegalActions(s, seat).find((a) => a.type === 'placeTile')!);
    expect(getLegalActions(s, seat).some((a) => a.type === 'reroll')).toBe(true);
    s = apply(s, { type: 'chooseToken', seat, slot: null });
    expect(applyAction(s, { type: 'reroll', seat })).toEqual({
      ok: false,
      reason: 'manual-reroll-too-late',
    });
  });

  it('§6.7 le retour arrière ne l’annule pas : on revient au marché d’après le reroll', () => {
    let s = setTokens(readyGame(), [X, Y, X, X]);
    const seat = activeSeat(s)!;
    s = apply(s, { type: 'chooseTile', seat, slot: 1 });
    const res = applyAction(s, { type: 'reroll', seat }, scripted([Z, Z, Y]));
    if (!res.ok) throw new Error(res.reason);
    s = apply(res.state, { type: 'undo', seat });
    expect(marketTokens(s.market)).toEqual([Z, Y, Z, Y]);
    expect(s.turn!.slot).toBeNull();
    expect(s.turn!.manualRerollUsed).toBe(true);
  });

  it('pas de bouton sans exactement m − 1 identiques, ni avec un marché de moins de 3', () => {
    const seatOf = (s: GameState) => activeSeat(s)!;
    const two = setTokens(readyGame(), [X, X, Y, Y]);
    expect(getLegalActions(two, seatOf(two)).some((a) => a.type === 'reroll')).toBe(false);
    const small = setTokens(readyGame({ marketSize: 2 }), [X, Y]);
    expect(getLegalActions(small, seatOf(small)).some((a) => a.type === 'reroll')).toBe(false);
  });

  it('désactivable en custom', () => {
    const s = setTokens(readyGame({ options: { manualReroll: false } }), [X, Y, X, X]);
    expect(applyAction(s, { type: 'reroll', seat: activeSeat(s)! }).ok).toBe(false);
  });
});
