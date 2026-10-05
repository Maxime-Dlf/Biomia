/**
 * Paramètres officiels (§12.2), valeurs par défaut du custom (§12.4) et préréglages.
 */
import type {
  GameConfig,
  GameMode,
  RuleOptions,
  SeatConfig,
  TeamConfig,
} from '@crassecadia/engine';
import { CORE_ENVS, CORE_SHAPES, type OfficialTier } from './ids.ts';

/** Options officielles, verrouillées en classique et en classé (§12.2). */
export const OFFICIAL_OPTIONS: RuleOptions = {
  steals: true,
  sabotage: true,
  autoReroll: true,
  manualReroll: true,
  monoBonus: 1,
  undo: true,
  turnOrder: 'random',
  capacityRatio: [1, 2, 2],
  thresholdDivisor: 10,
  objectives: {
    enabled: true,
    initialHigh: 1,
    initialLow: 2,
    broken: 'return-fixed-penalty',
    brokenPenalty: 2,
  },
  structureVisibility: 'own',
  scoreVisibility: 'live',
};

/** Valeurs par défaut du mode custom (§12.4) : ordre des sièges, sinon comme l'officiel. */
export const CUSTOM_DEFAULT_OPTIONS: RuleOptions = { ...OFFICIAL_OPTIONS, turnOrder: 'seats' };

export const OFFICIAL_ROUNDS = 20;
export const OFFICIAL_TURN_TIMER_MS = 45_000;
export const OFFICIAL_MARKET_SIZE = 4;

export function tierForAll(
  tier: string,
  shapes: readonly string[] = CORE_SHAPES,
): Record<string, string> {
  return Object.fromEntries(shapes.map((s) => [s, tier]));
}

export type Queue = '1v1' | '2v2' | 'ffa4';
export const QUEUE_SEATS: Readonly<Record<Queue, number>> = { '1v1': 2, '2v2': 4, ffa4: 4 };

/**
 * Configuration officielle d'une file de classique ou de classé (§12.2) : 20 manches, 45 s,
 * marché de 4, 0 joker, tier de la saison (saison 1 = Tier D), 5 + 5 par défaut, sans mod.
 */
export function officialConfig(
  queue: Queue,
  seats: readonly SeatConfig[],
  mode: Extract<GameMode, 'classic' | 'ranked'> = 'classic',
  seasonTier: OfficialTier = 'D',
): GameConfig {
  if (seats.length !== QUEUE_SEATS[queue]) {
    throw new Error(`La file ${queue} demande ${QUEUE_SEATS[queue]} sièges`);
  }
  const teams: TeamConfig[] | null =
    queue === '2v2'
      ? [
          { id: 'team-a', name: 'A', seats: [seats[0]!.id, seats[1]!.id] },
          { id: 'team-b', name: 'B', seats: [seats[2]!.id, seats[3]!.id] },
        ]
      : null;
  return {
    mode,
    seats,
    teams,
    rounds: OFFICIAL_ROUNDS,
    turnTimerMs: OFFICIAL_TURN_TIMER_MS,
    marketSize: OFFICIAL_MARKET_SIZE,
    startJokers: 0,
    tierByShape: tierForAll(seasonTier),
    activeShapes: CORE_SHAPES,
    activeEnvs: CORE_ENVS,
    options: OFFICIAL_OPTIONS,
    mods: [],
  };
}

export interface CustomOverrides extends Partial<Omit<GameConfig, 'options' | 'mode'>> {
  readonly options?: Partial<RuleOptions>;
  readonly mode?: Extract<GameMode, 'custom' | 'offline'>;
}

/** Configuration custom ou hors-ligne avec les valeurs par défaut du §12.4. */
export function customConfig(
  seats: readonly SeatConfig[],
  overrides: CustomOverrides = {},
): GameConfig {
  const { options, ...rest } = overrides;
  return {
    mode: 'custom',
    seats,
    teams: null,
    rounds: OFFICIAL_ROUNDS,
    turnTimerMs: OFFICIAL_TURN_TIMER_MS,
    marketSize: OFFICIAL_MARKET_SIZE,
    startJokers: 0,
    tierByShape: tierForAll('D'),
    activeShapes: CORE_SHAPES,
    activeEnvs: CORE_ENVS,
    mods: [],
    ...rest,
    options: { ...CUSTOM_DEFAULT_OPTIONS, ...options },
  };
}

export interface Preset {
  readonly id: string;
  readonly name: { readonly fr: string; readonly en: string };
  readonly apply: (seats: readonly SeatConfig[]) => GameConfig;
}

/** Préréglages du §12.4 : « Officiel », « Initiation (Tier A) », « Chaos (Tier C) ». */
export const PRESETS: readonly Preset[] = [
  {
    id: 'official',
    name: { fr: 'Officiel', en: 'Official' },
    apply: (seats) => customConfig(seats, { options: OFFICIAL_OPTIONS }),
  },
  {
    id: 'initiation',
    name: { fr: 'Initiation (Tier A)', en: 'Initiation (Tier A)' },
    apply: (seats) => customConfig(seats, { tierByShape: tierForAll('A') }),
  },
  {
    id: 'chaos',
    name: { fr: 'Chaos (Tier C)', en: 'Chaos (Tier C)' },
    apply: (seats) => customConfig(seats, { tierByShape: tierForAll('C') }),
  },
];
