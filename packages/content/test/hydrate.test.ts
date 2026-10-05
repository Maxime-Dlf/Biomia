import {
  type Action,
  actingSeats,
  applyAction,
  evaluate,
  type GameState,
  getLegalActions,
  HIDDEN_SHAPE,
  randomAction,
  rngFromSeed,
  type SeatConfig,
  stateFromView,
  viewFor,
} from '@crassecadia/engine';
import { describe, expect, it } from 'vitest';
import { createOfficialGame, customConfig, tierForAll } from '../src/index.ts';

const seats = (n: number): SeatConfig[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, bot: null }));

const key = (a: Action) => JSON.stringify(a);

/** L'état reconstruit depuis la vue d'un siège se comporte comme l'état complet pour ce siège. */
function expectEquivalent(state: GameState, seat: string): void {
  const view = viewFor(state, seat);
  const mirror = stateFromView(view, state.ruleSet);
  expect(getLegalActions(mirror, seat).map(key).sort()).toEqual(
    getLegalActions(state, seat).map(key).sort(),
  );
  expect(evaluate(mirror)).toEqual(evaluate(state));
  expect(evaluate(mirror, { provisional: true })).toEqual(evaluate(state, { provisional: true }));
  expect(mirror.deck.length - mirror.deckPos).toBe(state.deck.length - state.deckPos);
  // Les poses provisoires (sans tirage) s'appliquent à l'identique sur l'état reconstruit.
  for (const action of getLegalActions(state, seat)) {
    if (!['chooseTile', 'placeTile', 'chooseToken', 'placeToken', 'undo'].includes(action.type))
      continue;
    const full = applyAction(state, action);
    const mine = applyAction(mirror, action);
    expect(mine.ok && full.ok && mine.state.turn).toEqual(full.ok && full.state.turn);
    break;
  }
}

function playChecking(state: GameState, seed: string): GameState {
  const rng = rngFromSeed(seed);
  let s = state;
  let step = 0;
  while (s.phase !== 'ended') {
    // Vérification complète une étape sur trois (et à chaque étape des phases initiales).
    if (s.phase !== 'playing' || step % 3 === 0) {
      for (const seat of s.config.seats) expectEquivalent(s, seat.id);
    }
    const acting = actingSeats(s);
    const seat = acting[rng.int(acting.length)]!;
    const res = applyAction(s, randomAction(s, seat, rng)!);
    if (!res.ok) throw new Error(res.reason);
    s = res.state;
    step++;
  }
  for (const seat of s.config.seats) expectEquivalent(s, seat.id);
  return s;
}

describe('§15.5 état reconstruit par le client à partir de sa vue', () => {
  it('ne contient aucune information cachée (§18.2)', () => {
    const s = createOfficialGame(customConfig(seats(2), { rounds: 2 }), 'cache');
    const mirror = stateFromView(viewFor(s, 'p0'), s.ruleSet);
    expect(mirror.seed).toBe('');
    expect(mirror.rngState).toBe('');
    expect(new Set(mirror.deck.map((t) => t.id))).toEqual(new Set(['?']));
    expect(Object.keys(mirror.pool)).toEqual([HIDDEN_SHAPE]);
    expect(mirror.objectives!.low).toEqual([]);
    expect(mirror.objectives!.byCamp.p1).toEqual([]);
    expect(mirror.objectives!.vote!.draws.p1).toEqual([]);
    expect(mirror.objectives!.vote!.draws.p0).toHaveLength(3);
    expect(Object.keys(mirror.startTiles)).toEqual([]);
  });

  it('mêmes coups légaux et même score que l’état complet, en individuel (Tier D)', () => {
    playChecking(createOfficialGame(customConfig(seats(3), { rounds: 3 }), 'h-ffa'), 'h-ffa');
  });

  it('idem en équipes, Tier C (effets) et options §7.5 désactivées', () => {
    const config = customConfig(seats(4), {
      rounds: 2,
      tierByShape: tierForAll('C'),
      teams: [
        { id: 'A', name: 'A', seats: ['p0', 'p2'] },
        { id: 'B', name: 'B', seats: ['p1', 'p3'] },
      ],
      startJokers: 2,
      options: { steals: false, sabotage: false },
    });
    const end = playChecking(createOfficialGame(config, 'h-team'), 'h-team');
    expect(end.phase).toBe('ended');
  });
});
