import { describe, expect, it } from 'vitest';
import {
  activeSeat,
  applyAction,
  autoPlay,
  createGame,
  type GameConfig,
  type GameState,
  poolTotal,
  type Rng,
  randomAction,
  rngFromSeed,
} from '../src/index.ts';
import { makeConfig, TEST_RULESET } from './helpers/fixtures.ts';

// Le moteur n'a pas les types Node : seule la variable d'environnement est lue ici.
declare const process: { env: Record<string, string | undefined> };

/** Nombre de parties : 10 000 pour le critère de sortie de la phase 1 (`SIM_GAMES=10000`). */
const GAMES = Number(process.env.SIM_GAMES ?? 300);

function randomConfig(rng: Rng): GameConfig {
  const seatCount = 1 + rng.int(6);
  const useTeams = seatCount >= 2 && rng.int(3) === 0;
  const seats = Array.from({ length: seatCount }, (_, i) => `p${i}`);
  let teams: GameConfig['teams'] = null;
  if (useTeams) {
    const teamCount = 2 + rng.int(Math.min(2, seatCount - 1));
    const groups: string[][] = Array.from({ length: teamCount }, () => []);
    rng.shuffle(seats).forEach((s, i) => {
      groups[i % teamCount]!.push(s);
    });
    teams = groups.map((g, i) => ({ id: `team${i}`, name: `T${i}`, seats: g }));
  }
  return makeConfig({
    seatCount,
    teams,
    rounds: 1 + rng.int(6),
    marketSize: 1 + rng.int(6),
    startJokers: rng.int(3),
    options: {
      turnOrder: rng.int(2) === 0 ? 'seats' : 'random',
      autoReroll: rng.int(5) !== 0,
      manualReroll: rng.int(5) !== 0,
      undo: rng.int(5) !== 0,
      monoBonus: rng.int(3),
    },
  });
}

/** Invariants de la phase 1 (§21) vérifiés après chaque action. */
function checkInvariants(s: GameState, initialTokens: number): void {
  // Conservation des jetons : pool + marché + plateau = total.
  const onMarket = s.market.filter((m) => m.token !== null).length;
  expect(poolTotal(s.pool) + onMarket + s.tokens.size).toBe(initialTokens);
  for (const shape in s.pool) expect(s.pool[shape]).toBeGreaterThanOrEqual(0);
  // Jokers ≥ 0.
  for (const camp of Object.values(s.camps)) expect(camp.jokers).toBeGreaterThanOrEqual(0);
  if (s.phase === 'playing' || s.phase === 'ended') {
    // Marché toujours plein (la pioche contient exactement T tuiles).
    expect(s.market.every((m) => m.tile !== null)).toBe(true);
    // Une tuile par tour joué, en plus des tuiles de départ.
    expect(s.tiles.size).toBe(3 * s.config.seats.length + s.turnIndex);
  }
  // `seq` uniques et strictement croissants dans l'ordre des poses.
  const seqs = [...s.tiles.values(), ...s.tokens.values()].map((x) => x.seq);
  expect(new Set(seqs).size).toBe(seqs.length);
  expect(Math.max(0, ...seqs)).toBe(s.seqCounter);
}

function simulate(index: number): GameState {
  const rng = rngFromSeed(`sim-${index}`);
  const config = randomConfig(rng);
  let s = createGame(config, TEST_RULESET, `game-${index}`);
  const initialTokens = poolTotal(s.pool);
  let guard = 0;
  while (s.phase !== 'ended') {
    if (++guard > 100_000) throw new Error('partie sans fin');
    const seat = activeSeat(s)!;
    // Un siège sur cinq laisse expirer son minuteur : autoPlay termine le tour.
    const actions = rng.int(5) === 0 ? autoPlay(s, seat) : [randomAction(s, seat, rng)!];
    for (const action of actions) {
      const res = applyAction(s, action);
      if (!res.ok) throw new Error(`partie ${index} : ${res.reason} ${JSON.stringify(action)}`);
      s = res.state;
      checkInvariants(s, initialTokens);
    }
  }
  expect(s.turnIndex).toBe(s.totalTurns);
  return s;
}

describe('§21 Phase 1 — simulation de parties aléatoires', () => {
  it(`${GAMES} parties sans erreur, invariants respectés`, { timeout: 3_600_000 }, () => {
    for (let i = 0; i < GAMES; i++) simulate(i);
  });
});
