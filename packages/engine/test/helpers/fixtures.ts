import {
  type Action,
  applyAction,
  balancedTileGenerator,
  createGame,
  type GameConfig,
  type GameState,
  type RuleOptions,
  type RuleSet,
} from '../../src/index.ts';

export const SHAPES = ['t:square', 't:triangle', 't:heart', 't:circle', 't:star'];
export const ENVS = ['t:E0', 't:E1', 't:E2', 't:E3', 't:E4'];

/** RuleSet minimal sans scorer : suffit pour le flux de jeu (phase 1). */
export const TEST_RULESET: RuleSet = {
  id: 'test',
  shapes: SHAPES.map((id) => ({ id, name: { fr: id } })),
  envs: ENVS.map((id) => ({ id, name: { fr: id } })),
  generators: { tiles: balancedTileGenerator },
  validators: [],
  scorers: [],
  objectiveTemplates: [],
};

export const DEFAULT_OPTIONS: RuleOptions = {
  steals: true,
  sabotage: true,
  autoReroll: true,
  manualReroll: true,
  monoBonus: 1,
  undo: true,
  turnOrder: 'seats',
  capacityRatio: [1, 2, 2],
  thresholdDivisor: 10,
  objectives: {
    enabled: false,
    initialHigh: 1,
    initialLow: 2,
    broken: 'return-fixed-penalty',
    brokenPenalty: 2,
  },
  structureVisibility: 'own',
  scoreVisibility: 'live',
};

export interface ConfigOverrides extends Partial<Omit<GameConfig, 'options'>> {
  seatCount?: number;
  options?: Partial<RuleOptions>;
}

export function makeConfig(overrides: ConfigOverrides = {}): GameConfig {
  const { seatCount = 2, options, ...rest } = overrides;
  const seats = Array.from({ length: seatCount }, (_, i) => ({
    id: `p${i}`,
    name: `P${i}`,
    bot: null,
  }));
  return {
    mode: 'custom',
    seats,
    teams: null,
    rounds: 20,
    turnTimerMs: 45_000,
    marketSize: 4,
    startJokers: 0,
    tierByShape: Object.fromEntries(SHAPES.map((s) => [s, 'D'])),
    activeShapes: SHAPES,
    activeEnvs: ENVS,
    mods: [],
    ...rest,
    options: { ...DEFAULT_OPTIONS, ...options },
  };
}

export function apply(state: GameState, action: Action): GameState {
  const res = applyAction(state, action);
  if (!res.ok) throw new Error(`Action refusée : ${res.reason} (${JSON.stringify(action)})`);
  return res.state;
}

/** Pose toutes les tuiles de départ avec le premier coup légal (orientation 0 si possible). */
export function placeAllStartTiles(state: GameState): GameState {
  let s = state;
  while (s.phase === 'startTiles') {
    const seat = s.startOrder[s.startIndex]!;
    if (s.tiles.size === 0) {
      s = apply(s, { type: 'placeStartTile', seat, q: 0, r: 0, orientation: 0 });
      continue;
    }
    // Ligne vers l'est : la cellule de capacité 1 juste à droite de la tuile la plus à l'est.
    let maxQ = Number.NEGATIVE_INFINITY;
    for (const t of s.tiles.values()) if (t.r === 0 && t.q > maxQ) maxQ = t.q;
    s = apply(s, { type: 'placeStartTile', seat, q: maxQ + 1, r: 0, orientation: 0 });
  }
  return s;
}

export function newGame(overrides: ConfigOverrides = {}, seed = 'seed-1'): GameState {
  return createGame(makeConfig(overrides), TEST_RULESET, seed);
}

/** Partie prête à jouer (tuiles de départ posées). */
export function readyGame(overrides: ConfigOverrides = {}, seed = 'seed-1'): GameState {
  return placeAllStartTiles(newGame(overrides, seed));
}
