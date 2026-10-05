/**
 * `viewFor` (§15.4) : vue d'un participant, sans l'information cachée (§18.2) :
 * ni pioche, ni graine, ni état du RNG, ni composition de la pool, ni tuiles de départ des autres
 * avant leur pose.
 */
import type {
  CampId,
  CampState,
  Counters,
  GameConfig,
  GamePhase,
  GameState,
  MarketSlot,
  PlacedTile,
  PlacedToken,
  SeatId,
  StartTile,
  TurnState,
} from '../core/types.ts';
import type { HeldObjective, ObjectiveCard } from '../objectives/types.ts';

export type Viewer = SeatId | 'spectator';

export interface PlayerView {
  readonly viewer: Viewer;
  readonly config: GameConfig;
  readonly phase: GamePhase;
  readonly seqCounter: number;
  readonly tileCount: number;
  readonly threshold: number;
  readonly tiles: readonly PlacedTile[];
  readonly tokens: readonly PlacedToken[];
  readonly market: readonly MarketSlot[];
  readonly camps: Readonly<Record<CampId, CampState>>;
  readonly seatCamp: Readonly<Record<SeatId, CampId>>;
  readonly counters: Readonly<Record<CampId, Counters>>;
  readonly turnCycle: readonly SeatId[];
  readonly totalTurns: number;
  readonly turnIndex: number;
  readonly startOrder: readonly SeatId[];
  readonly startIndex: number;
  /** Tuile de départ du spectateur s'il en a une et ne l'a pas encore posée (§5.4). */
  readonly ownStartTile: StartTile | null;
  /** Actions provisoires du siège actif, affichées en fantôme (§6.8). */
  readonly turn: TurnState | null;
  readonly deckCount: number;
  readonly poolCount: number;
  /** Objectifs visibles : ceux de son camp, tous en fin de partie (§10.1). */
  readonly objectives: ObjectivesView | null;
}

export interface ObjectivesView {
  /** Objectifs gardés par camp ; `null` si cachés (autre camp, partie en cours). */
  readonly byCamp: Readonly<Record<CampId, readonly HeldObjective[] | null>>;
  /** Nombre d'objectifs gardés par camp (public). */
  readonly counts: Readonly<Record<CampId, number>>;
  /** Vote en cours : cartes et votes de son camp uniquement. */
  readonly vote: {
    readonly kind: 'initial' | 'resupply';
    readonly camps: readonly CampId[];
    readonly cards: readonly ObjectiveCard[];
    readonly votes: Readonly<Record<SeatId, Readonly<Record<string, boolean>>>>;
  } | null;
}

/** Objectifs visibles d'un participant (§10.1). */
export function objectivesView(state: GameState, viewer: Viewer): ObjectivesView | null {
  const o = state.objectives;
  if (!o) return null;
  const myCamp = viewer === 'spectator' ? null : (state.seatCamp[viewer] ?? null);
  const revealed = state.phase === 'ended';
  const byCamp: Record<CampId, readonly HeldObjective[] | null> = {};
  const counts: Record<CampId, number> = {};
  for (const [camp, held] of Object.entries(o.byCamp)) {
    byCamp[camp] = revealed || camp === myCamp ? held : null;
    counts[camp] = held.length;
  }
  let vote: ObjectivesView['vote'] = null;
  if (o.vote) {
    const mySeats = myCamp ? (state.camps[myCamp]?.seats ?? []) : [];
    vote = {
      kind: o.vote.kind,
      camps: Object.keys(o.vote.draws),
      cards: myCamp ? (o.vote.draws[myCamp] ?? []) : [],
      votes: Object.fromEntries(mySeats.map((s) => [s, o.vote!.votes[s] ?? {}])),
    };
  }
  return { byCamp, counts, vote };
}

/** Tuile de départ d'un siège tant qu'il ne l'a pas posée (§5.4). */
export function ownStartTile(state: GameState, viewer: Viewer): StartTile | null {
  if (viewer === 'spectator' || state.phase !== 'startTiles') return null;
  return state.startOrder.indexOf(viewer) >= state.startIndex
    ? (state.startTiles[viewer] ?? null)
    : null;
}

export function viewFor(state: GameState, viewer: Viewer): PlayerView {
  let poolCount = 0;
  for (const shape in state.pool) poolCount += state.pool[shape]!;
  return {
    viewer,
    config: state.config,
    phase: state.phase,
    seqCounter: state.seqCounter,
    tileCount: state.tileCount,
    threshold: state.threshold,
    tiles: [...state.tiles.values()],
    tokens: [...state.tokens.values()],
    market: state.market,
    camps: state.camps,
    seatCamp: state.seatCamp,
    counters: state.counters,
    turnCycle: state.turnCycle,
    totalTurns: state.totalTurns,
    turnIndex: state.turnIndex,
    startOrder: state.startOrder,
    startIndex: state.startIndex,
    ownStartTile: ownStartTile(state, viewer),
    turn: state.turn,
    deckCount: state.deck.length - state.deckPos,
    poolCount,
    objectives: objectivesView(state, viewer),
  };
}
