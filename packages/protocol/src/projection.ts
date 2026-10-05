/**
 * Projection de l'état autoritaire dans le Schema Colyseus (§15.5), décrite par sa forme JSON
 * (`room.state.toJSON()` côté client) :
 * - le plateau est un journal de poses en ajout seul (`tiles`, `tokens`) ;
 * - marché, sièges, camps, phase, tour et minuteur sont publics ;
 * - la partie privée d'un siège (tuile de départ, objectifs de son camp, vote en cours) n'est
 *   envoyée qu'à ce siège, par `StateView`.
 *
 * Les champs rarement modifiés ou de forme libre (configuration, objectifs) sont des chaînes JSON
 * produites par les fonctions de ce module, partagées par le serveur et le client.
 */
import {
  type CampId,
  type CampState,
  type Counters,
  type GameConfig,
  type GamePhase,
  type GameState,
  type HeldObjective,
  type MarketSlot,
  type ObjectiveCard,
  type ObjectivesView,
  objectivesView,
  ownStartTile,
  type PlacedTile,
  type PlacedToken,
  type PlayerView,
  type Rotation,
  type SeatId,
  type StartTile,
  type TileDef,
  type TurnState,
} from '@crassecadia/engine';

/* ------------------------------------------------------------------ forme JSON */

export interface ProjectedTileDef {
  readonly id: string;
  readonly edges: readonly string[];
  readonly accepted: readonly string[];
}

export interface ProjectedTile extends ProjectedTileDef {
  readonly q: number;
  readonly r: number;
  readonly rotation: number;
  readonly placedBy: SeatId;
  readonly seq: number;
}

export interface ProjectedToken {
  readonly shape: string;
  readonly q: number;
  readonly r: number;
  readonly placedBy: SeatId;
  readonly seq: number;
}

export interface ProjectedSlot {
  /** Absente si la pioche est épuisée. */
  readonly tile?: ProjectedTileDef;
  /** `''` si la pool est épuisée. */
  readonly token: string;
}

export interface ProjectedCamp {
  readonly jokers: number;
  readonly steals: number;
  readonly invalidations: number;
  readonly monoBonuses: number;
  readonly tokensPlaced: number;
}

/** Tour en cours ; `-1` code l'absence (emplacement, jeton choisi). */
export interface ProjectedTurn {
  readonly seat: SeatId;
  readonly slot: number;
  readonly tilePlaced: boolean;
  readonly tileQ: number;
  readonly tileR: number;
  readonly rotation: number;
  /** `-2` = jeton pas encore choisi, `-1` = « aucun jeton ». */
  readonly tokenSlot: number;
  readonly tokenPlaced: boolean;
  readonly tokenQ: number;
  readonly tokenR: number;
  readonly manualRerollUsed: boolean;
  readonly resupplyUsed: boolean;
}

export interface ProjectedGame {
  /** JSON de `GameInfo` : données fixées à la création de la partie. */
  readonly info: string;
  readonly phase: string;
  readonly seqCounter: number;
  readonly turnIndex: number;
  readonly startIndex: number;
  readonly deckCount: number;
  readonly poolCount: number;
  /** Échéance du minuteur en cours (horloge du serveur, ms), `0` sans minuteur. */
  readonly deadline: number;
  readonly tiles: readonly ProjectedTile[];
  readonly tokens: readonly ProjectedToken[];
  readonly market: readonly ProjectedSlot[];
  readonly camps: Readonly<Record<CampId, ProjectedCamp>>;
  readonly turn?: ProjectedTurn;
  /** JSON de `PublicObjectives`. */
  readonly objectives: string;
}

export interface ProjectedSeat {
  readonly id: SeatId;
  readonly name: string;
  /** Niveau du bot pour un siège de bot, sinon `''`. */
  readonly bot: string;
  readonly connected: boolean;
  /** Équipe choisie en salle d'attente (composition libre, §11.1), `-1` sans équipe. */
  readonly team: number;
}

/** Partie privée d'un siège, visible de lui seul (`StateView`). */
export interface ProjectedPrivate {
  readonly seat: SeatId;
  /** JSON de `StartTile | null`. */
  readonly startTile: string;
  /** JSON de `HeldObjective[] | null` (objectifs de son camp). */
  readonly objectives: string;
  /** JSON de `PrivateVote | null`. */
  readonly vote: string;
  /** Dernier `clientSeq` traité pour ce siège (réconciliation des actions prédites). */
  readonly lastClientSeq: number;
}

export interface ProjectedRoom {
  readonly protocol: number;
  readonly stage: 'lobby' | 'game';
  readonly name: string;
  readonly visibility: 'public' | 'protected' | 'private';
  /** Verrouillé par l'hôte (§12.3). */
  readonly locked: boolean;
  readonly language: string;
  readonly spectators: number;
  readonly host: SeatId;
  /** JSON des `RoomSettings` (§12.4). */
  readonly settings: string;
  readonly seats: Readonly<Record<SeatId, ProjectedSeat>>;
  readonly game?: ProjectedGame;
  readonly privates?: Readonly<Record<SeatId, ProjectedPrivate>>;
}

/* ------------------------------------------------------------------ parties JSON */

/** Données fixées à la création de la partie. */
export interface GameInfo {
  readonly config: GameConfig;
  readonly tileCount: number;
  readonly threshold: number;
  readonly turnCycle: readonly SeatId[];
  readonly totalTurns: number;
  readonly startOrder: readonly SeatId[];
  readonly seatCamp: Readonly<Record<SeatId, CampId>>;
  readonly campSeats: Readonly<Record<CampId, readonly SeatId[]>>;
}

export interface PublicObjectives {
  readonly enabled: boolean;
  readonly counts: Readonly<Record<CampId, number>>;
  readonly vote: {
    readonly kind: 'initial' | 'resupply';
    readonly camps: readonly CampId[];
  } | null;
  /** Objectifs de tous les camps, révélés en fin de partie (§10.1). */
  readonly revealed: Readonly<Record<CampId, readonly HeldObjective[]>> | null;
}

export interface PrivateVote {
  readonly cards: readonly ObjectiveCard[];
  readonly votes: Readonly<Record<SeatId, Readonly<Record<string, boolean>>>>;
}

export function gameInfo(state: GameState): GameInfo {
  return {
    config: state.config,
    tileCount: state.tileCount,
    threshold: state.threshold,
    turnCycle: state.turnCycle,
    totalTurns: state.totalTurns,
    startOrder: state.startOrder,
    seatCamp: state.seatCamp,
    campSeats: Object.fromEntries(Object.values(state.camps).map((c) => [c.id, c.seats])),
  };
}

/** Partie publique des objectifs : effectifs, vote en cours, révélation en fin de partie. */
export function publicObjectives(state: GameState): PublicObjectives {
  const o = objectivesView(state, 'spectator');
  if (!o) return { enabled: false, counts: {}, vote: null, revealed: null };
  const revealed = state.phase === 'ended' ? (o.byCamp as PublicObjectives['revealed']) : null;
  return {
    enabled: true,
    counts: o.counts,
    vote: o.vote ? { kind: o.vote.kind, camps: o.vote.camps } : null,
    revealed,
  };
}

/**
 * Parties privées d'un siège (§15.5) : sa tuile de départ, les objectifs de son camp et le vote en
 * cours de son camp. Identiques aux champs correspondants de `viewFor(state, seat)`.
 */
export function privateParts(
  state: GameState,
  seat: SeatId,
): Pick<ProjectedPrivate, 'startTile' | 'objectives' | 'vote'> {
  const camp = state.seatCamp[seat];
  const o = objectivesView(state, seat);
  const held = o && camp !== undefined ? (o.byCamp[camp] ?? null) : null;
  const vote: PrivateVote | null = o?.vote ? { cards: o.vote.cards, votes: o.vote.votes } : null;
  return {
    startTile: JSON.stringify(ownStartTile(state, seat)),
    objectives: JSON.stringify(held),
    vote: JSON.stringify(vote),
  };
}

export function projectTurn(turn: TurnState): ProjectedTurn {
  return {
    seat: turn.seat,
    slot: turn.slot ?? -1,
    tilePlaced: turn.tilePlacement !== null,
    tileQ: turn.tilePlacement?.q ?? 0,
    tileR: turn.tilePlacement?.r ?? 0,
    rotation: turn.tilePlacement?.rotation ?? 0,
    tokenSlot: turn.tokenChoice === null ? -2 : (turn.tokenChoice.slot ?? -1),
    tokenPlaced: turn.tokenPlacement !== null,
    tokenQ: turn.tokenPlacement?.q ?? 0,
    tokenR: turn.tokenPlacement?.r ?? 0,
    manualRerollUsed: turn.manualRerollUsed,
    resupplyUsed: turn.resupplyUsed,
  };
}

/* ------------------------------------------------------------------ reconstruction */

const tileDef = (t: ProjectedTileDef): TileDef => ({
  id: t.id,
  edges: [...t.edges],
  accepted: [...t.accepted],
});

function turnState(t: ProjectedTurn | undefined): TurnState | null {
  // Le Schema peut transmettre un sous-objet vide : pas de siège, pas de tour.
  if (!t?.seat) return null;
  return {
    seat: t.seat,
    slot: t.slot < 0 ? null : t.slot,
    tilePlacement: t.tilePlaced
      ? { q: t.tileQ, r: t.tileR, rotation: t.rotation as Rotation }
      : null,
    tokenChoice: t.tokenSlot === -2 ? null : { slot: t.tokenSlot < 0 ? null : t.tokenSlot },
    tokenPlacement: t.tokenPlaced ? { q: t.tokenQ, r: t.tokenR } : null,
    manualRerollUsed: t.manualRerollUsed,
    resupplyUsed: t.resupplyUsed,
  };
}

/** Analyse JSON mémorisée : les champs JSON changent rarement. */
const parsed = new Map<string, unknown>();
function parseJson<T>(text: string): T {
  let value = parsed.get(text);
  if (value === undefined) {
    value = JSON.parse(text);
    if (parsed.size > 64) parsed.clear();
    parsed.set(text, value);
  }
  return value as T;
}

/**
 * `PlayerView` d'un siège reconstruite à partir de la projection reçue (§15.5) ; `null` tant que la
 * partie n'a pas commencé. Identique à `viewFor(état du serveur, siège)`.
 */
export function viewFromProjection(
  room: ProjectedRoom,
  viewer: SeatId | 'spectator',
): PlayerView | null {
  const g = room.game;
  if (room.stage !== 'game' || !g?.info) return null;
  const info = parseJson<GameInfo>(g.info);
  const mine = viewer === 'spectator' ? undefined : room.privates?.[viewer];
  const camps: Record<CampId, CampState> = {};
  const counters: Record<CampId, Counters> = {};
  for (const [id, seats] of Object.entries(info.campSeats)) {
    const c = g.camps[id];
    camps[id] = { id, seats, jokers: c?.jokers ?? 0 };
    counters[id] = {
      steals: c?.steals ?? 0,
      invalidations: c?.invalidations ?? 0,
      monoBonuses: c?.monoBonuses ?? 0,
      tokensPlaced: c?.tokensPlaced ?? 0,
    };
  }
  const tiles: PlacedTile[] = g.tiles.map((t) => ({
    def: tileDef(t),
    q: t.q,
    r: t.r,
    rotation: t.rotation as Rotation,
    placedBy: t.placedBy,
    seq: t.seq,
  }));
  const tokens: PlacedToken[] = g.tokens.map((t) => ({
    shape: t.shape,
    q: t.q,
    r: t.r,
    placedBy: t.placedBy,
    seq: t.seq,
  }));
  const market: MarketSlot[] = g.market.map((m) => ({
    tile: m.tile?.id ? tileDef(m.tile) : null,
    token: m.token === '' ? null : m.token,
  }));

  const pub = parseJson<PublicObjectives>(g.objectives);
  let objectives: ObjectivesView | null = null;
  if (pub.enabled) {
    const myCamp = viewer === 'spectator' ? undefined : info.seatCamp[viewer];
    const held = mine ? parseJson<HeldObjective[] | null>(mine.objectives) : null;
    const vote = mine ? parseJson<PrivateVote | null>(mine.vote) : null;
    const byCamp: Record<CampId, readonly HeldObjective[] | null> = {};
    for (const camp of Object.keys(pub.counts)) {
      byCamp[camp] = pub.revealed ? (pub.revealed[camp] ?? []) : camp === myCamp ? held : null;
    }
    objectives = {
      byCamp,
      counts: pub.counts,
      vote: pub.vote
        ? {
            kind: pub.vote.kind,
            camps: pub.vote.camps,
            cards: vote?.cards ?? [],
            votes: vote?.votes ?? {},
          }
        : null,
    };
  }

  return {
    viewer,
    config: info.config,
    phase: g.phase as GamePhase,
    seqCounter: g.seqCounter,
    tileCount: info.tileCount,
    threshold: info.threshold,
    tiles,
    tokens,
    market,
    camps,
    seatCamp: info.seatCamp,
    counters,
    turnCycle: info.turnCycle,
    totalTurns: info.totalTurns,
    turnIndex: g.turnIndex,
    startOrder: info.startOrder,
    startIndex: g.startIndex,
    ownStartTile: mine ? parseJson<StartTile | null>(mine.startTile) : null,
    turn: turnState(g.turn),
    deckCount: g.deckCount,
    poolCount: g.poolCount,
    objectives,
  };
}
