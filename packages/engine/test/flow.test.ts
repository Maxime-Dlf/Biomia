import { describe, expect, it } from 'vitest';
import {
  type Action,
  activeSeat,
  applyAction,
  ConfigError,
  cellKey,
  createGame,
  effectiveBoard,
  type GameState,
  getLegalActions,
  type MarketSlot,
  placedEdges,
  poolTotal,
  rotateEdges,
  turnStep,
} from '../src/index.ts';
import {
  apply,
  makeConfig,
  newGame,
  placeAllStartTiles,
  readyGame,
  SHAPES,
  TEST_RULESET,
} from './helpers/fixtures.ts';

const seatOf = (s: GameState) => activeSeat(s)!;

/** Remplace le marché (test) en conservant la conservation des jetons via la pool. */
function withMarket(state: GameState, market: MarketSlot[]): GameState {
  const pool: Record<string, number> = { ...state.pool };
  for (const slot of state.market) if (slot.token) pool[slot.token]! += 1;
  for (const slot of market) if (slot.token) pool[slot.token]! -= 1;
  return { ...state, market, pool };
}

/** Cellule frontière quelconque (la première dans l'ordre). */
function firstFrontier(state: GameState) {
  const a = getLegalActions(state, seatOf(state)).find((x) => x.type === 'placeTile');
  if (a?.type !== 'placeTile') throw new Error('pas de pose');
  return a;
}

describe('§5 Mise en place', () => {
  it('validation : configuration incohérente refusée', () => {
    expect(() => createGame(makeConfig({ rounds: 0 }), TEST_RULESET, 's')).toThrow(ConfigError);
    expect(() => createGame(makeConfig({ activeShapes: [SHAPES[0]!] }), TEST_RULESET, 's')).toThrow(
      /2 formes/,
    );
  });

  it('démarre en pose des tuiles de départ, sans marché', () => {
    const s = newGame();
    expect(s.phase).toBe('startTiles');
    expect(s.market).toEqual([]);
    expect(activeSeat(s)).toBe(s.startOrder[0]);
  });

  it('§5.6 J1 pose sa cellule de capacité 1 en (0, 0), dans l’orientation de son choix', () => {
    const s = newGame();
    const j1 = seatOf(s);
    expect(
      applyAction(s, { type: 'placeStartTile', seat: j1, q: 1, r: 0, orientation: 0 }),
    ).toEqual({ ok: false, reason: 'first-start-tile-must-be-at-origin' });
    const legal = getLegalActions(s, j1);
    expect(legal).toHaveLength(6);
    const after = apply(s, { type: 'placeStartTile', seat: j1, q: 0, r: 0, orientation: 2 });
    expect(after.tiles.get(cellKey(0, 0))!.def.accepted).toHaveLength(1);
  });

  it('§5.6 les 3 cellules reçoivent des seq consécutifs (capacités 1, 2, 3) et le poseur', () => {
    const s = newGame();
    const j1 = seatOf(s);
    const after = apply(s, { type: 'placeStartTile', seat: j1, q: 0, r: 0, orientation: 0 });
    const cells = [cellKey(0, 0), cellKey(1, 0), cellKey(1, -1)].map((k) => after.tiles.get(k)!);
    expect(cells.map((c) => c.seq)).toEqual([1, 2, 3]);
    expect(cells.map((c) => c.def.accepted.length)).toEqual([1, 2, 3]);
    expect(cells.every((c) => c.placedBy === j1)).toBe(true);
  });

  it('§5.6 orientation : la pièce tourne de façon rigide (vecteurs et arêtes)', () => {
    const s = newGame();
    const j1 = seatOf(s);
    const start = s.startTiles[j1]!;
    const after = apply(s, { type: 'placeStartTile', seat: j1, q: 0, r: 0, orientation: 1 });
    // Base (1, 0) → (0, 1) ; base (1, −1) → (1, 0).
    expect(after.tiles.get(cellKey(0, 1))!.def).toBe(start.cells[1]);
    expect(after.tiles.get(cellKey(1, 0))!.def).toBe(start.cells[2]);
    // L'arête de la cellule 2 qui regardait la cellule 1 (direction 0 → O) la regarde toujours.
    const c1 = after.tiles.get(cellKey(0, 0))!;
    const c2 = after.tiles.get(cellKey(0, 1))!;
    // Cellule 2 en (0, 1) = direction 5 de la cellule 1 ; rotation des arêtes = −1 mod 6 = 5.
    expect(placedEdges(c1)[5]).toBe(start.cells[0].edges[0]);
    expect(placedEdges(c2)[2]).toBe(start.cells[1].edges[3]);
    expect(placedEdges(c2)).toEqual(rotateEdges(start.cells[1].edges, 5));
  });

  it('§5.6 les suivants : cellules libres, au moins une adjacente', () => {
    let s = newGame();
    s = apply(s, { type: 'placeStartTile', seat: seatOf(s), q: 0, r: 0, orientation: 0 });
    const p2 = seatOf(s);
    expect(
      applyAction(s, { type: 'placeStartTile', seat: p2, q: 0, r: 0, orientation: 3 }),
    ).toEqual({ ok: false, reason: 'cell-occupied' });
    expect(
      applyAction(s, { type: 'placeStartTile', seat: p2, q: 5, r: 5, orientation: 0 }),
    ).toEqual({ ok: false, reason: 'not-adjacent' });
    const legal = getLegalActions(s, p2);
    expect(legal.length).toBeGreaterThan(10);
    for (const a of legal) expect(applyAction(s, a).ok).toBe(true);
  });

  it('§5.7 marché initial de m emplacements après la dernière tuile de départ', () => {
    const s = readyGame({ seatCount: 3 });
    expect(s.phase).toBe('playing');
    expect(s.tiles.size).toBe(9);
    expect(s.market).toHaveLength(4);
    expect(s.market.every((m) => m.tile !== null && m.token !== null)).toBe(true);
    expect(s.deckPos).toBe(4);
    expect(s.turn?.seat).toBe(s.turnCycle[0]);
    expect(s.seqCounter).toBe(9);
  });

  it('seul le siège actif peut agir', () => {
    const s = readyGame();
    const other = s.turnCycle[1]!;
    expect(applyAction(s, { type: 'chooseTile', seat: other, slot: 0 })).toEqual({
      ok: false,
      reason: 'not-your-turn',
    });
  });
});

describe('§6 Déroulement d’un tour', () => {
  it('§6.1 machine à états : choixTuile → poseTuile → choixJeton → poseJeton → confirmation', () => {
    let s = readyGame();
    const seat = seatOf(s);
    expect(turnStep(s.turn!)).toBe('chooseTile');
    s = apply(s, { type: 'chooseTile', seat, slot: 0 });
    expect(turnStep(s.turn!)).toBe('placeTile');
    const p = firstFrontier(s);
    s = apply(s, p);
    expect(turnStep(s.turn!)).toBe('chooseToken');
    s = apply(s, { type: 'chooseToken', seat, slot: null });
    expect(turnStep(s.turn!)).toBe('confirm');
    const before = s.turnIndex;
    s = apply(s, { type: 'confirm', seat });
    expect(s.turnIndex).toBe(before + 1);
    expect(s.turn!.seat).toBe(s.turnCycle[1]);
  });

  it('§6.3 pose sur une cellule vide adjacente, 6 rotations, sans contrainte d’arêtes', () => {
    let s = readyGame();
    const seat = seatOf(s);
    s = apply(s, { type: 'chooseTile', seat, slot: 1 });
    expect(applyAction(s, { type: 'placeTile', seat, q: 0, r: 0, rotation: 0 }).ok).toBe(false);
    expect(applyAction(s, { type: 'placeTile', seat, q: 40, r: 0, rotation: 0 }).ok).toBe(false);
    expect(applyAction(s, { type: 'placeTile', seat, q: -1, r: 0, rotation: 6 }).ok).toBe(false);
    for (let rotation = 0; rotation < 6; rotation++) {
      expect(applyAction(s, { type: 'placeTile', seat, q: -1, r: 0, rotation }).ok).toBe(true);
    }
  });

  it('§6.4 jeton associé gratuit ; tuile et jeton i remplacés à la confirmation', () => {
    let s = readyGame();
    const seat = seatOf(s);
    const shape = s.market[2]!.token!;
    const otherSlots = s.market.filter((_, i) => i !== 2);
    s = apply(s, { type: 'chooseTile', seat, slot: 2 });
    s = apply(s, firstFrontier(s));
    s = apply(s, { type: 'chooseToken', seat, slot: 2 });
    const target = getLegalActions(s, seat).find((a) => a.type === 'placeToken')!;
    s = apply(s, target);
    const res = applyAction(s, { type: 'confirm', seat });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const next = res.state;
    expect([...next.tokens.values()].some((t) => t.shape === shape && t.placedBy === seat)).toBe(
      true,
    );
    expect(next.market.filter((_, i) => i !== 2)).toEqual(otherSlots);
    expect(next.deckPos).toBe(s.deckPos + 1);
    const refill = res.events.find((e) => e.type === 'MarketRefilled');
    expect(refill && refill.type === 'MarketRefilled' && refill.slots).toEqual([2]);
  });

  it('§6.4 jeton d’un autre emplacement : 1 joker, tuile i remplacée, jeton i conservé, jeton j remplacé', () => {
    let s = readyGame();
    const seat = seatOf(s);
    const camp = s.seatCamp[seat]!;
    s = { ...s, camps: { ...s.camps, [camp]: { ...s.camps[camp]!, jokers: 1 } } };
    // Jeton j = 1 forcé sur une forme acceptée par la cellule de capacité 2 du J1, en (1, 0).
    const shape = s.tiles.get(cellKey(1, 0))!.def.accepted[0]!;
    s = withMarket(
      s,
      s.market.map((m, i) => (i === 1 ? { ...m, token: shape } : m)),
    );
    const tokenI = s.market[0]!.token;
    const tileI = s.market[0]!.tile;
    const tileJ = s.market[1]!.tile;
    s = apply(s, { type: 'chooseTile', seat, slot: 0 });
    s = apply(s, firstFrontier(s));
    s = apply(s, { type: 'chooseToken', seat, slot: 1 });
    s = apply(s, { type: 'placeToken', seat, q: 1, r: 0 });
    const res = applyAction(s, { type: 'confirm', seat });
    if (!res.ok) throw new Error(res.reason);
    const next = res.state;
    expect(next.market[0]!.token).toBe(tokenI);
    expect(next.market[0]!.tile).not.toBe(tileI);
    expect(next.market[1]!.tile).toBe(tileJ);
    expect(next.camps[camp]!.jokers).toBe(0);
    expect(res.events.some((e) => e.type === 'JokerSpent')).toBe(true);
    expect(next.tokens.get(cellKey(1, 0))!.shape).toBe(shape);
  });

  it('§6.4 sans joker, le jeton d’un autre emplacement est refusé', () => {
    let s = readyGame();
    const seat = seatOf(s);
    s = apply(s, { type: 'chooseTile', seat, slot: 0 });
    s = apply(s, firstFrontier(s));
    expect(applyAction(s, { type: 'chooseToken', seat, slot: 1 }).ok).toBe(false);
  });

  it('§6.4 aucun jeton : tuile i remplacée, jeton i renvoyé dans la pool et remplacé', () => {
    let s = readyGame();
    const seat = seatOf(s);
    const totalBefore = poolTotal(s.pool) + s.market.length + s.tokens.size;
    s = apply(s, { type: 'chooseTile', seat, slot: 3 });
    s = apply(s, firstFrontier(s));
    s = apply(s, { type: 'chooseToken', seat, slot: null });
    const next = apply(s, { type: 'confirm', seat });
    expect(next.tokens.size).toBe(0);
    expect(poolTotal(next.pool) + next.market.length).toBe(totalBefore);
  });

  it('§6.4 un jeton non plaçable ne peut pas être sélectionné', () => {
    let s = readyGame();
    const seat = seatOf(s);
    // Une forme que plus aucune tuile libre n'accepte : on remplit toutes les tuiles compatibles.
    const shape = s.market[0]!.token!;
    const tokens = new Map(s.tokens);
    for (const [k, t] of s.tiles) {
      if (t.def.accepted.includes(shape)) {
        tokens.set(k, { shape, q: t.q, r: t.r, placedBy: seat, seq: 0 });
      }
    }
    s = { ...s, tokens };
    s = apply(s, { type: 'chooseTile', seat, slot: 0 });
    // Tuile posée qui n'accepte pas la forme ? Sinon le jeton redevient plaçable (§6.4).
    s = apply(s, firstFrontier(s));
    const placeable = s.market[0]!.tile!.accepted.includes(shape);
    expect(applyAction(s, { type: 'chooseToken', seat, slot: 0 }).ok).toBe(placeable);
  });

  it('§6.5 le jeton se pose sur une tuile sans jeton qui accepte sa forme, y compris la nouvelle', () => {
    let s = readyGame();
    const seat = seatOf(s);
    s = apply(s, { type: 'chooseTile', seat, slot: 0 });
    const p = firstFrontier(s);
    s = apply(s, p);
    const shape = s.market[0]!.token!;
    s = apply(s, { type: 'chooseToken', seat, slot: 0 });
    const board = effectiveBoard(s);
    for (const a of getLegalActions(s, seat)) {
      if (a.type !== 'placeToken') continue;
      const tile = board.tiles.get(cellKey(a.q, a.r))!;
      expect(tile.def.accepted).toContain(shape);
    }
    const onNew = s.market[0]!.tile!.accepted.includes(shape);
    expect(applyAction(s, { type: 'placeToken', seat, q: p.q, r: p.r }).ok).toBe(onNew);
  });

  it('§6.6 bonus monochrome : +1 joker pour un jeton posé sur une tuile de capacité 1', () => {
    let s = readyGame();
    const seat = seatOf(s);
    const camp = s.seatCamp[seat]!;
    // La cellule (0, 0) du J1 est monochrome ; on force le jeton associé à sa forme.
    const mono = s.tiles.get(cellKey(0, 0))!;
    const shape = mono.def.accepted[0]!;
    s = withMarket(
      s,
      s.market.map((m, i) => (i === 0 ? { ...m, token: shape } : m)),
    );
    s = apply(s, { type: 'chooseTile', seat, slot: 0 });
    s = apply(s, firstFrontier(s));
    s = apply(s, { type: 'chooseToken', seat, slot: 0 });
    s = apply(s, { type: 'placeToken', seat, q: 0, r: 0 });
    const res = applyAction(s, { type: 'confirm', seat });
    if (!res.ok) throw new Error(res.reason);
    expect(res.state.camps[camp]!.jokers).toBe(1);
    expect(res.state.counters[camp]!.monoBonuses).toBe(1);
    expect(res.events.some((e) => e.type === 'JokerGained')).toBe(true);
  });

  it('§6.6 bonus monochrome désactivable', () => {
    let s = readyGame({ options: { monoBonus: 0 } });
    const seat = seatOf(s);
    const shape = s.tiles.get(cellKey(0, 0))!.def.accepted[0]!;
    s = withMarket(
      s,
      s.market.map((m, i) => (i === 0 ? { ...m, token: shape } : m)),
    );
    s = apply(s, { type: 'chooseTile', seat, slot: 0 });
    s = apply(s, firstFrontier(s));
    s = apply(s, { type: 'chooseToken', seat, slot: 0 });
    s = apply(s, { type: 'placeToken', seat, q: 0, r: 0 });
    s = apply(s, { type: 'confirm', seat });
    expect(s.camps[s.seatCamp[seat]!]!.jokers).toBe(0);
  });

  it('§6.7 retour arrière : action par action jusqu’au choix initial, tout est remboursé', () => {
    const start = readyGame();
    const seat = seatOf(start);
    let s = apply(start, { type: 'chooseTile', seat, slot: 0 });
    s = apply(s, firstFrontier(s));
    s = apply(s, { type: 'chooseToken', seat, slot: 0 });
    s = apply(s, getLegalActions(s, seat).find((a) => a.type === 'placeToken')!);
    const steps: string[] = [];
    while (turnStep(s.turn!) !== 'chooseTile') {
      s = apply(s, { type: 'undo', seat });
      steps.push(turnStep(s.turn!));
    }
    expect(steps).toEqual(['placeToken', 'chooseToken', 'placeTile', 'chooseTile']);
    expect(s).toEqual(start);
    expect(applyAction(s, { type: 'undo', seat })).toEqual({
      ok: false,
      reason: 'nothing-to-undo',
    });
  });

  it('§6.7 retour arrière désactivable', () => {
    let s = readyGame({ options: { undo: false } });
    const seat = seatOf(s);
    s = apply(s, { type: 'chooseTile', seat, slot: 0 });
    expect(applyAction(s, { type: 'undo', seat }).ok).toBe(false);
  });

  it('§6.8 la fin du tour doit être confirmée ; les actions provisoires ne touchent pas le plateau', () => {
    let s = readyGame();
    const seat = seatOf(s);
    s = apply(s, { type: 'chooseTile', seat, slot: 0 });
    s = apply(s, firstFrontier(s));
    expect(s.tiles.size).toBe(6);
    expect(effectiveBoard(s).tiles.size).toBe(7);
    expect(applyAction(s, { type: 'confirm', seat }).ok).toBe(false);
    s = apply(s, { type: 'chooseToken', seat, slot: null });
    s = apply(s, { type: 'confirm', seat });
    expect(s.tiles.size).toBe(7);
  });

  it('§6.9 les emplacements non touchés sont conservés pour le joueur suivant', () => {
    let s = readyGame();
    const seat = seatOf(s);
    const untouched = s.market.slice(1);
    s = apply(s, { type: 'chooseTile', seat, slot: 0 });
    s = apply(s, firstFrontier(s));
    s = apply(s, { type: 'chooseToken', seat, slot: null });
    s = apply(s, { type: 'confirm', seat });
    expect(s.market.slice(1)).toEqual(untouched);
  });

  it('fin de partie après le dernier tour de la dernière manche ; il reste m tuiles au marché', () => {
    let s = readyGame({ rounds: 3 });
    while (s.phase === 'playing') {
      const seat = seatOf(s);
      s = apply(s, { type: 'chooseTile', seat, slot: 0 });
      s = apply(s, firstFrontier(s));
      s = apply(s, { type: 'chooseToken', seat, slot: null });
      s = apply(s, { type: 'confirm', seat });
    }
    expect(s.phase).toBe('ended');
    expect(s.turnIndex).toBe(6);
    expect(s.deckPos).toBe(s.deck.length);
    expect(s.market.every((m) => m.tile !== null)).toBe(true);
    expect(s.tiles.size).toBe(6 + 6);
  });

  it('les tours tournent selon l’ordre de passage, manche après manche', () => {
    let s = readyGame({ seatCount: 3, rounds: 2 });
    const order: string[] = [];
    while (s.phase === 'playing') {
      const seat = seatOf(s);
      order.push(seat);
      s = apply(s, { type: 'chooseTile', seat, slot: 0 });
      s = apply(s, firstFrontier(s));
      s = apply(s, { type: 'chooseToken', seat, slot: null });
      s = apply(s, { type: 'confirm', seat });
    }
    expect(order).toEqual([...s.turnCycle, ...s.turnCycle]);
  });

  it('tout tour se termine (aucun blocage) : getLegalActions n’est jamais vide pour le siège actif', () => {
    let s = placeAllStartTiles(newGame({ rounds: 2 }));
    while (s.phase === 'playing') {
      const legal = getLegalActions(s, seatOf(s));
      expect(legal.length).toBeGreaterThan(0);
      const progress = legal.find((a: Action) => a.type !== 'undo' && a.type !== 'reroll')!;
      s = apply(s, progress);
    }
  });
});
