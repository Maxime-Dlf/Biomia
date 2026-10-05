import {
  actingSeats,
  applyAction,
  crasseCounts,
  evaluate,
  type GameEvent,
  type GameState,
  randomAction,
  rngFromSeed,
  type SeatConfig,
} from '@crassecadia/engine';
import { describe, expect, it } from 'vitest';
import {
  createOfficialGame,
  customConfig,
  officialConfig,
  PRESETS,
  tierForAll,
} from '../src/index.ts';

const seats = (n: number): SeatConfig[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, bot: null }));

/** Joue une partie complète avec la politique aléatoire ; retourne l'état final et les événements. */
function playOut(state: GameState, seed: string): { state: GameState; events: GameEvent[] } {
  const rng = rngFromSeed(seed);
  let s = state;
  const events: GameEvent[] = [];
  while (s.phase !== 'ended') {
    const seats = actingSeats(s);
    const seat = seats[rng.int(seats.length)]!;
    const camp = s.seatCamp[seat]!;
    const res = applyAction(s, randomAction(s, seat, rng)!);
    if (!res.ok) throw new Error(res.reason);
    // Compteurs permanents (§10.1) : cohérents avec les événements du coup.
    const counts = crasseCounts(res.events, camp);
    expect(res.state.counters[camp]!.steals - s.counters[camp]!.steals).toBe(counts.steals);
    expect(res.state.counters[camp]!.invalidations - s.counters[camp]!.invalidations).toBe(
      counts.invalidations,
    );
    events.push(...res.events);
    s = res.state;
  }
  return { state: s, events };
}

describe('§12.2 Paramètres officiels', () => {
  it('files 1v1, 2v2 (équipes) et FFA 4 : 20 manches, 45 s, marché de 4, Tier D', () => {
    const duel = officialConfig('1v1', seats(2));
    expect(duel).toMatchObject({ rounds: 20, turnTimerMs: 45_000, marketSize: 4, startJokers: 0 });
    expect(Object.values(duel.tierByShape)).toEqual(['D', 'D', 'D', 'D', 'D']);
    expect(duel.options.turnOrder).toBe('random');
    expect(officialConfig('2v2', seats(4)).teams).toHaveLength(2);
    expect(() => officialConfig('ffa4', seats(3))).toThrow();
  });

  it('§4.3 et §8.2 : 1v1 → T = 44, S = 4 ; FFA 4 et 2v2 → T = 84, S = 8', () => {
    const duel = createOfficialGame(officialConfig('1v1', seats(2)), 's');
    expect([duel.tileCount, duel.threshold]).toEqual([44, 4]);
    for (const queue of ['ffa4', '2v2'] as const) {
      const g = createOfficialGame(officialConfig(queue, seats(4)), 's');
      expect([g.tileCount, g.threshold]).toEqual([84, 8]);
    }
  });

  it('préréglages Officiel, Initiation (Tier A), Chaos (Tier C)', () => {
    expect(PRESETS.map((p) => p.id)).toEqual(['official', 'initiation', 'chaos']);
    expect(Object.values(PRESETS[1]!.apply(seats(2)).tierByShape)).toEqual([
      'A',
      'A',
      'A',
      'A',
      'A',
    ]);
  });
});

describe('§21 Phase 2 — parties complètes avec le contenu officiel', () => {
  for (const tier of ['A', 'B', 'C', 'D']) {
    it(`Tier ${tier} : parties FFA 3 de bout en bout, compteurs et rapport final cohérents`, () => {
      for (let g = 0; g < 2; g++) {
        const config = customConfig(seats(3), { rounds: 8, tierByShape: tierForAll(tier) });
        const { state } = playOut(createOfficialGame(config, `${tier}-${g}`), `${tier}-${g}`);
        const final = evaluate(state);
        expect(final.final).toBe(true);
        for (const camp of Object.values(final.byCamp)) {
          const tokens = Object.values(camp.tokens).reduce((a, b) => a + b, 0);
          expect(camp.total).toBe(
            camp.environments +
              camp.endBonuses +
              tokens +
              camp.effects +
              camp.objectives +
              camp.jokers,
          );
          expect(Number.isInteger(camp.total)).toBe(true);
        }
      }
    });
  }

  it('options §7.5 (vols et sabotage désactivés) : partie complète sans erreur', () => {
    const config = customConfig(seats(2), {
      rounds: 6,
      options: { steals: false, sabotage: false },
    });
    const { state } = playOut(createOfficialGame(config, 'opts'), 'opts');
    expect(state.phase).toBe('ended');
  });
});
