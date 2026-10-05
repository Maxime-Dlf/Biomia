/**
 * Ordre de passage (§5.3) et ordre en équipes (§11.1).
 */
import type { Rng } from '../core/rng.ts';
import type { CampId, GameConfig, SeatId } from '../core/types.ts';

function rotate<T>(items: readonly T[], start: number): T[] {
  return items.slice(start).concat(items.slice(0, start));
}

export interface TurnOrder {
  /** Ordre d'une manche ; un siège peut y apparaître plusieurs fois en équipes inégales. */
  readonly cycle: SeatId[];
  /** Ordre de pose des tuiles de départ : première apparition de chaque siège (§5.6). */
  readonly startOrder: SeatId[];
}

/**
 * Ordre d'une manche en équipes (§11.1) :
 * pour s de 0 à taille_max − 1, pour chaque équipe t : joue équipe[t][s mod taille(t)].
 */
export function teamCycle(teams: readonly (readonly SeatId[])[]): SeatId[] {
  const maxSize = Math.max(...teams.map((t) => t.length));
  const cycle: SeatId[] = [];
  for (let s = 0; s < maxSize; s++) {
    for (const team of teams) cycle.push(team[s % team.length]!);
  }
  return cycle;
}

/**
 * Tire J1 et calcule l'ordre de passage (§5.3).
 * - `seats` : J1 tiré au sort, puis l'ordre des sièges à partir de J1. En équipes, l'équipe de J1
 *   joue en premier et J1 ouvre son équipe ; les autres équipes suivent l'ordre de composition.
 * - `random` : ordre entièrement aléatoire (ordre des équipes et ordre dans chaque équipe).
 */
export function computeTurnOrder(config: GameConfig, rng: Rng): TurnOrder {
  const random = config.options.turnOrder === 'random';
  let cycle: SeatId[];
  if (config.teams === null) {
    const seats = config.seats.map((s) => s.id);
    cycle = random ? rng.shuffle(seats) : rotate(seats, rng.int(seats.length));
  } else {
    let teams = config.teams.map((t) => t.seats.slice());
    if (random) {
      teams = rng.shuffle(teams).map((t) => rng.shuffle(t));
    } else {
      const all = teams.flat();
      const j1 = all[rng.int(all.length)]!;
      const ti = teams.findIndex((t) => t.includes(j1));
      teams = rotate(teams, ti);
      teams[0] = rotate(teams[0]!, teams[0]!.indexOf(j1));
    }
    cycle = teamCycle(teams);
  }
  return { cycle, startOrder: [...new Set(cycle)] };
}

/** Camp de chaque siège : le siège lui-même en individuel, l'équipe sinon (§11.1). */
export function seatCamps(config: GameConfig): Record<SeatId, CampId> {
  const out: Record<SeatId, CampId> = {};
  if (config.teams === null) {
    for (const s of config.seats) out[s.id] = s.id;
  } else {
    for (const t of config.teams) for (const s of t.seats) out[s] = t.id;
  }
  return out;
}
