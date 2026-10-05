import { describe, expect, it } from 'vitest';
import {
  type Action,
  activeSeat,
  applyAction,
  autoPlay,
  type GameEvent,
  type GameState,
  getLegalActions,
  replayedDrawSource,
  replayGame,
  viewFor,
} from '../src/index.ts';
import { apply, makeConfig, newGame, readyGame, TEST_RULESET } from './helpers/fixtures.ts';

function runAuto(state: GameState): { state: GameState; actions: Action[]; events: GameEvent[] } {
  const seat = activeSeat(state)!;
  const actions = autoPlay(state, seat);
  let s = state;
  const events: GameEvent[] = [];
  for (const a of actions) {
    const res = applyAction(s, a);
    if (!res.ok) throw new Error(res.reason);
    s = res.state;
    events.push(...res.events);
  }
  return { state: s, actions, events };
}

describe('§6.10 autoPlay', () => {
  it('termine le tour entier : tuile, jeton associé ou aucun, confirmation', () => {
    const s = readyGame();
    const { state, actions } = runAuto(s);
    expect(actions[actions.length - 1]!.type).toBe('confirm');
    expect(state.turnIndex).toBe(s.turnIndex + 1);
    expect(state.tiles.size).toBe(s.tiles.size + 1);
  });

  it('ne dépense jamais de joker et ne fait jamais de reroll manuel', () => {
    let s = readyGame({ rounds: 10, startJokers: 5 });
    while (s.phase === 'playing') {
      const { state, actions, events } = runAuto(s);
      expect(actions.some((a) => a.type === 'reroll')).toBe(false);
      expect(events.some((e) => e.type === 'JokerSpent')).toBe(false);
      s = state;
    }
    expect(s.phase).toBe('ended');
  });

  it('reprend un tour entamé : l’emplacement déjà choisi est conservé', () => {
    let s = readyGame();
    const seat = activeSeat(s)!;
    s = apply(s, { type: 'chooseTile', seat, slot: 2 });
    const { actions } = runAuto(s);
    expect(actions[0]!.type).toBe('placeTile');
    expect(actions.some((a) => a.type === 'chooseTile')).toBe(false);
  });

  it('pose la tuile de départ au hasard parmi les poses légales', () => {
    const s = newGame({ seatCount: 3 });
    const seat = activeSeat(s)!;
    const [action] = autoPlay(s, seat);
    expect(getLegalActions(s, seat)).toContainEqual(action);
  });

  it('déterministe et sans effet sur le RNG de la partie', () => {
    const s = readyGame();
    expect(autoPlay(s, activeSeat(s)!)).toEqual(autoPlay(s, activeSeat(s)!));
    expect(autoPlay(s, s.turnCycle[1]!)).toEqual([]);
  });
});

describe('§15.4 viewFor — information cachée (§18.2)', () => {
  it('ni pioche, ni graine, ni RNG, ni composition de la pool', () => {
    const s = readyGame();
    const view = viewFor(s, 'p0');
    const json = JSON.stringify(view);
    expect(json).not.toContain(s.seed);
    expect(json).not.toContain(s.rngState);
    expect('deck' in view).toBe(false);
    expect('pool' in view).toBe(false);
    expect(view.deckCount).toBe(s.deck.length - s.deckPos);
    // Aucune tuile encore dans la pioche n'apparaît dans la vue.
    for (const t of s.deck.slice(s.deckPos)) expect(json).not.toContain(`"id":"${t.id}"`);
  });

  it('§5.4 chacun voit sa tuile de départ, pas celle des autres', () => {
    const s = newGame({ seatCount: 3 });
    const [a, b] = s.startOrder as [string, string];
    expect(viewFor(s, a).ownStartTile?.seat).toBe(a);
    expect(viewFor(s, b).ownStartTile?.seat).toBe(b);
    expect(JSON.stringify(viewFor(s, a))).not.toContain(s.startTiles[b]!.cells[0].id);
    expect(viewFor(s, 'spectator').ownStartTile).toBeNull();
  });

  it('§6.8 les actions provisoires du siège actif sont visibles (fantôme)', () => {
    let s = readyGame();
    const seat = activeSeat(s)!;
    s = apply(s, { type: 'chooseTile', seat, slot: 1 });
    expect(viewFor(s, s.turnCycle[1]!).turn?.slot).toBe(1);
  });
});

describe('§15.4 Replays et DrawSource', () => {
  function playRandomGame(seed: string) {
    const config = makeConfig({ seatCount: 3, rounds: 4 });
    let s = newGame({ seatCount: 3, rounds: 4 }, seed);
    const actions: Action[] = [];
    while (s.phase !== 'ended') {
      for (const a of autoPlay(s, activeSeat(s)!)) {
        actions.push(a);
        s = apply(s, a);
      }
    }
    return { config, state: s, actions };
  }

  it('configuration + graine + actions → rejeu identique', () => {
    const { config, state, actions } = playRandomGame('replay-1');
    const replayed = replayGame(TEST_RULESET, { config, seed: 'replay-1', actions });
    expect(replayed.state).toEqual(state);
  });

  it('le client rejoue une action avec les tirages révélés par le serveur', () => {
    let server = readyGame();
    const seat = activeSeat(server)!;
    for (const a of autoPlay(server, seat).slice(0, -1)) server = apply(server, a);
    const confirm: Action = { type: 'confirm', seat };
    const res = applyAction(server, confirm);
    if (!res.ok) throw new Error(res.reason);
    // Côté client : pioche inconnue (tuiles factices), tirages rejoués.
    const hidden = { id: '?', edges: [], accepted: [] };
    const client: GameState = {
      ...server,
      deck: server.deck.map(() => hidden),
      rngState: '0.0.0.0',
    };
    const res2 = applyAction(client, confirm, replayedDrawSource(res.draws));
    if (!res2.ok) throw new Error(res2.reason);
    expect(res2.state.market).toEqual(res.state.market);
    expect(res2.state.pool).toEqual(res.state.pool);
    expect(res2.state.tiles).toEqual(res.state.tiles);
  });
});
