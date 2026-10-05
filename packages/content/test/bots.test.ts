import {
  actingSeats,
  applyAction,
  type BotLevel,
  botAction,
  evaluate,
  finalRanking,
  type GameEvent,
  type GameState,
  rngFromSeed,
  type SeatConfig,
} from '@crassecadia/engine';
import { describe, expect, it } from 'vitest';
import { createOfficialGame, customConfig } from '../src/index.ts';

/** Joue une partie complète, chaque siège avec la politique de son niveau. */
function playOut(state: GameState, seed: string): { state: GameState; events: GameEvent[] } {
  const rng = rngFromSeed(seed);
  let s = state;
  const events: GameEvent[] = [];
  while (s.phase !== 'ended') {
    const acting = actingSeats(s);
    const seat = acting[rng.int(acting.length)]!;
    const level = s.config.seats.find((x) => x.id === seat)!.bot!;
    const action = botAction(level, s, seat, rng);
    expect(action).not.toBeNull();
    const res = applyAction(s, action!);
    if (!res.ok) throw new Error(`${level} : ${res.reason}`);
    events.push(...res.events);
    s = res.state;
  }
  return { state: s, events };
}

const duel = (a: BotLevel, b: BotLevel): SeatConfig[] => [
  { id: 'p0', name: 'P0', bot: a },
  { id: 'p1', name: 'P1', bot: b },
];

/** Victoires du premier niveau, en alternant les places (premier joueur tiré au sort). */
function winRate(a: BotLevel, b: BotLevel, games: number, rounds: number): number {
  let wins = 0;
  for (let g = 0; g < games; g++) {
    const seats = g % 2 === 0 ? duel(a, b) : duel(b, a);
    const { state } = playOut(
      createOfficialGame(customConfig(seats, { rounds }), `w${g}`),
      `w${g}`,
    );
    const top = finalRanking(state, evaluate(state))[0]!;
    const winner = top.length === 1 ? state.config.seats.find((s) => s.id === top[0])! : null;
    if (winner?.bot === a) wins++;
  }
  return wins / games;
}

describe('§11.5 bots Facile, Moyen et Rusé', () => {
  it('critère de la phase 8 : le bot Moyen bat le bot Facile dans plus de 70 % des parties', () => {
    expect(winRate('medium', 'easy', 20, 10)).toBeGreaterThan(0.7);
  });

  it('le Rusé bat le Facile ; seul le Rusé dépense des jokers', () => {
    expect(winRate('cunning', 'easy', 10, 10)).toBeGreaterThan(0.7);
    const spent = new Map<string, number>();
    for (let g = 0; g < 6; g++) {
      const seats: SeatConfig[] = [
        { id: 'e', name: 'E', bot: 'easy' },
        { id: 'm', name: 'M', bot: 'medium' },
        { id: 'c', name: 'C', bot: 'cunning' },
      ];
      const config = customConfig(seats, { rounds: 10, startJokers: 3 });
      const { events } = playOut(createOfficialGame(config, `j${g}`), `j${g}`);
      for (const e of events) {
        if (e.type === 'JokerSpent') spent.set(e.camp, (spent.get(e.camp) ?? 0) + e.amount);
      }
    }
    expect(spent.get('c') ?? 0).toBeGreaterThan(0);
    expect(spent.get('e') ?? 0).toBe(0);
    expect(spent.get('m') ?? 0).toBe(0);
  });

  it('Moyen et Rusé gardent un seul objectif, le moins risqué ; Facile garde la haute valeur', () => {
    const seats: SeatConfig[] = [
      { id: 'e', name: 'E', bot: 'easy' },
      { id: 'm', name: 'M', bot: 'medium' },
    ];
    let s = createOfficialGame(customConfig(seats, { rounds: 2 }), 'votes');
    const rng = rngFromSeed('votes');
    const drawn = s.objectives!.vote!.draws;
    while (s.phase === 'objectives') {
      const seat = actingSeats(s)[0]!;
      const res = applyAction(
        s,
        botAction(s.config.seats.find((x) => x.id === seat)!.bot!, s, seat, rng)!,
      );
      if (!res.ok) throw new Error(res.reason);
      s = res.state;
    }
    const kept = (camp: string) => s.objectives!.byCamp[camp]!.map((h) => h.card.id);
    expect(kept('e')).toEqual(drawn.e!.filter((c) => c.tier === 'high').map((c) => c.id));
    const cheapest = [...drawn.m!].sort((a, b) => a.value - b.value)[0]!;
    expect(kept('m')).toEqual([cheapest.id]);
  });
});

describe('§11.1 équipes inégales', () => {
  it('une partie 1 contre 3 avec objectifs se joue de bout en bout, avec un vote par coéquipier', () => {
    const seats: SeatConfig[] = [
      { id: 'a1', name: 'A1', bot: 'medium' },
      { id: 'b1', name: 'B1', bot: 'easy' },
      { id: 'b2', name: 'B2', bot: 'cunning' },
      { id: 'b3', name: 'B3', bot: 'medium' },
    ];
    const config = customConfig(seats, {
      rounds: 6,
      teams: [
        { id: 'A', name: 'A', seats: ['a1'] },
        { id: 'B', name: 'B', seats: ['b1', 'b2', 'b3'] },
      ],
    });
    const start = createOfficialGame(config, '1v3');
    // Ordre de passage : chaque équipe joue autant de tours (§11.1).
    // J1 est tiré au sort ; son équipe ouvre (I6). Le cycle alterne A1 avec B1, B2 et B3.
    const cycle = start.turnCycle;
    expect(cycle).toHaveLength(6);
    const bs = cycle.filter((s) => s !== 'a1');
    expect(new Set(bs)).toEqual(new Set(['b1', 'b2', 'b3']));
    for (let i = 0; i < 6; i++) expect(cycle[i] === 'a1').not.toBe(cycle[(i + 1) % 6] === 'a1');
    const { state, events } = playOut(start, '1v3');
    expect(state.phase).toBe('ended');
    // Vote d'équipe (§10.5) : les trois coéquipiers ont voté sur les cartes de l'équipe B.
    const kept = events.filter((e) => e.type === 'ObjectivesKept');
    // Tirage initial clos pour les deux camps (puis d'éventuels ravitaillements).
    expect(
      kept
        .slice(0, 2)
        .map((e) => (e as { camp: string }).camp)
        .sort(),
    ).toEqual(['A', 'B']);
    expect(state.objectives!.byCamp.B!.length).toBeGreaterThanOrEqual(1);
    const report = evaluate(state);
    expect(Object.keys(report.byCamp).sort()).toEqual(['A', 'B']);
    // Tours joués : 6 manches × 2 équipes × 3 tours (taille max) = 36 tuiles + départs (4 × 3).
    expect(state.tiles.size).toBe(36 + 12);
  });
});
