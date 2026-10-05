/**
 * Création d'une partie (§5, étapes 1 à 4) : validation de la configuration, génération,
 * J1 et ordre de passage. La pose des tuiles de départ se fait ensuite par actions.
 */
import { rngFromSeed } from '../core/rng.ts';
import type { RuleSet } from '../core/ruleset.ts';
import type {
  CampId,
  CampState,
  Counters,
  GameConfig,
  GameState,
  SeatId,
  StartTile,
} from '../core/types.ts';
import { initialDeal } from '../objectives/flow.ts';
import { generateObjectiveDecks } from '../objectives/generation.ts';
import type { ObjectivesState } from '../objectives/types.ts';
import {
  buildPool,
  computeThreshold,
  computeTileCount,
  generateDeck,
  generateStartTiles,
} from './generation.ts';
import { computeTurnOrder, seatCamps } from './order.ts';

export class ConfigError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`Configuration invalide : ${problems.join(' ; ')}`);
    this.name = 'ConfigError';
  }
}

const isInt = (n: number, min: number) => Number.isInteger(n) && n >= min;

/** Contrôles techniques de la configuration (bornes du §12.4, cohérence des équipes). */
export function validateConfig(config: GameConfig, ruleSet: RuleSet): string[] {
  const problems: string[] = [];
  const seatIds = config.seats.map((s) => s.id);
  if (seatIds.length < 1) problems.push('au moins 1 siège');
  if (new Set(seatIds).size !== seatIds.length) problems.push('identifiants de sièges en double');
  if (config.teams !== null) {
    if (config.teams.length < 1) problems.push('au moins 1 équipe');
    const inTeams = config.teams.flatMap((t) => t.seats);
    if (config.teams.some((t) => t.seats.length === 0)) problems.push('équipe vide');
    if (new Set(config.teams.map((t) => t.id)).size !== config.teams.length)
      problems.push('équipes en double');
    if (inTeams.length !== seatIds.length || !seatIds.every((s) => inTeams.includes(s))) {
      problems.push('chaque siège doit appartenir à exactement une équipe');
    }
  }
  if (!isInt(config.rounds, 1)) problems.push('manches : entier ≥ 1');
  if (!isInt(config.marketSize, 1)) problems.push('marché : entier ≥ 1');
  if (!isInt(config.startJokers, 0)) problems.push('jokers de départ : entier ≥ 0');
  if (config.turnTimerMs !== null && !isInt(config.turnTimerMs, 1))
    problems.push('minuteur : entier > 0 ou null');
  const knownShapes = new Set(ruleSet.shapes.map((s) => s.id));
  const knownEnvs = new Set(ruleSet.envs.map((e) => e.id));
  if (new Set(config.activeShapes).size < 2) problems.push('au moins 2 formes actives');
  if (new Set(config.activeEnvs).size < 2) problems.push('au moins 2 environnements actifs');
  for (const s of config.activeShapes)
    if (!knownShapes.has(s)) problems.push(`forme inconnue : ${s}`);
  for (const e of config.activeEnvs)
    if (!knownEnvs.has(e)) problems.push(`environnement inconnu : ${e}`);
  const o = config.options;
  if (o.capacityRatio.length === 0 || !o.capacityRatio.every((p) => isInt(p, 0))) {
    problems.push('ratio des capacités : entiers ≥ 0');
  } else if (o.capacityRatio.slice(0, config.activeShapes.length).reduce((a, b) => a + b, 0) <= 0) {
    problems.push('ratio des capacités : poids total nul');
  }
  if (!(o.thresholdDivisor > 0)) problems.push('diviseur du seuil : > 0');
  if (!isInt(o.monoBonus, 0)) problems.push('bonus monochrome : entier ≥ 0');
  return problems;
}

/**
 * `createGame` (§15.4). Ordre des tirages : pioche (§4.4), tuiles de départ (§4.6), pool (§4.5),
 * paquets d'objectifs (§10.4), puis J1 et ordre de passage (§5.3). La partie démarre par le choix
 * des objectifs initiaux (§5.5) s'ils sont activés, sinon par la pose des tuiles de départ.
 */
export function createGame(config: GameConfig, ruleSet: RuleSet, seed: string): GameState {
  const problems = validateConfig(config, ruleSet);
  if (problems.length > 0) throw new ConfigError(problems);

  const rng = rngFromSeed(seed);
  const tileCount = computeTileCount(config);
  const threshold = computeThreshold(tileCount, config.marketSize, config.options.thresholdDivisor);
  const deck = generateDeck(config, ruleSet, tileCount, rng);
  const seatIds = config.seats.map((s) => s.id);
  const starts = generateStartTiles(config, ruleSet, seatIds, rng);
  const pool = buildPool(config.activeShapes, deck, starts);
  const objectivesOn = config.options.objectives.enabled && ruleSet.objectiveTemplates.length > 0;
  const decks = objectivesOn
    ? generateObjectiveDecks(
        ruleSet.objectiveTemplates,
        { config, threshold, scorers: ruleSet.scorers },
        rng,
        0,
      )
    : null;
  const order = computeTurnOrder(config, rng);

  const seatCamp = seatCamps(config);
  const camps: Record<CampId, CampState> = {};
  const counters: Record<CampId, Counters> = {};
  for (const seat of seatIds) {
    const camp = seatCamp[seat]!;
    const existing = camps[camp];
    camps[camp] = existing
      ? { ...existing, seats: [...existing.seats, seat] }
      : { id: camp, seats: [seat], jokers: config.startJokers };
    counters[camp] = { steals: 0, invalidations: 0, monoBonuses: 0, tokensPlaced: 0 };
  }
  const startTiles: Record<SeatId, StartTile> = {};
  for (const st of starts) startTiles[st.seat] = st;

  const state: GameState = {
    ruleSet,
    config,
    seed,
    rngState: rng.state(),
    seqCounter: 0,
    tileCount,
    threshold,
    tiles: new Map(),
    tokens: new Map(),
    deck,
    deckPos: 0,
    pool,
    market: [],
    camps,
    seatCamp,
    turnCycle: order.cycle,
    totalTurns: order.cycle.length * config.rounds,
    turnIndex: 0,
    startOrder: order.startOrder,
    startTiles,
    startIndex: 0,
    phase: 'startTiles',
    turn: null,
    counters,
    objectives: null,
  };
  if (!decks) return state;
  const objectives: ObjectivesState = {
    low: decks.low,
    high: decks.high,
    discard: [],
    byCamp: Object.fromEntries(Object.keys(camps).map((c) => [c, []])),
    vote: null,
    generation: 0,
  };
  return { ...state, phase: 'objectives', objectives: initialDeal(state, objectives) };
}
