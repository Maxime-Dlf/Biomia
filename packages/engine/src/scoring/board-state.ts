/**
 * État synthétique pour évaluer un plateau donné (plateaux de référence §20.1, outils, mods).
 * Chaque camp a un siège de même identifiant.
 */
import { type CellKey, cellKey } from '../core/hex.ts';
import type { RuleSet } from '../core/ruleset.ts';
import type {
  CampId,
  CampState,
  Counters,
  GameConfig,
  GameState,
  PlacedTile,
  PlacedToken,
} from '../core/types.ts';

export interface BoardStateInput {
  readonly ruleSet: RuleSet;
  /** Configuration ; `seats` et `teams` sont remplacés par un siège par camp. */
  readonly config: GameConfig;
  readonly camps: readonly CampId[];
  readonly tiles: readonly PlacedTile[];
  readonly tokens: readonly PlacedToken[];
  readonly threshold: number;
  readonly jokers?: Readonly<Record<CampId, number>>;
  /** `true` : partie terminée (étapes de fin évaluées). */
  readonly ended?: boolean;
}

export function boardState(input: BoardStateInput): GameState {
  const tiles = new Map<CellKey, PlacedTile>();
  for (const t of input.tiles) tiles.set(cellKey(t.q, t.r), t);
  const tokens = new Map<CellKey, PlacedToken>();
  for (const t of input.tokens) tokens.set(cellKey(t.q, t.r), t);
  const camps: Record<CampId, CampState> = {};
  const counters: Record<CampId, Counters> = {};
  const seatCamp: Record<string, CampId> = {};
  for (const c of input.camps) {
    camps[c] = { id: c, seats: [c], jokers: input.jokers?.[c] ?? 0 };
    counters[c] = { steals: 0, invalidations: 0, monoBonuses: 0, tokensPlaced: 0 };
    seatCamp[c] = c;
  }
  const seqs = [...input.tiles, ...input.tokens].map((x) => x.seq);
  return {
    ruleSet: input.ruleSet,
    config: {
      ...input.config,
      seats: input.camps.map((c) => ({ id: c, name: c, bot: null })),
      teams: null,
    },
    seed: 'board',
    rngState: '00000000.00000000.00000000.00000001',
    seqCounter: Math.max(0, ...seqs),
    tileCount: tiles.size,
    threshold: input.threshold,
    tiles,
    tokens,
    deck: [],
    deckPos: 0,
    pool: {},
    market: [],
    camps,
    seatCamp,
    turnCycle: [...input.camps],
    totalTurns: 0,
    turnIndex: 0,
    startOrder: [...input.camps],
    startTiles: {},
    startIndex: input.camps.length,
    phase: input.ended ? 'ended' : 'playing',
    turn: null,
    counters,
    objectives: null,
  };
}
