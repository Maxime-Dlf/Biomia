/**
 * Types principaux du moteur (§23.1). Tous les objets d'état sont immuables : chaque action
 * produit un nouvel état (§15.1).
 */
import type { ObjectivesState } from '../objectives/types.ts';
import type { CellKey, Hex, Rotation } from './hex.ts';
import type { RuleSet } from './ruleset.ts';

export type SeatId = string;
export type CampId = string;
export type ShapeId = string;
export type EnvId = string;

/** Tuile : 6 arêtes colorées et une liste de formes acceptées (§2). */
export interface TileDef {
  readonly id: string;
  /** `edges.length === 6`, arête `i` tournée vers la direction `i` avant rotation. */
  readonly edges: readonly EnvId[];
  readonly accepted: readonly ShapeId[];
}

export interface PlacedTile {
  readonly def: TileDef;
  readonly q: number;
  readonly r: number;
  readonly rotation: Rotation;
  readonly placedBy: SeatId;
  readonly seq: number;
}

export interface PlacedToken {
  readonly shape: ShapeId;
  readonly q: number;
  readonly r: number;
  readonly placedBy: SeatId;
  readonly seq: number;
}

/** Emplacement du marché : 1 tuile et 1 jeton associé (§2). `null` si la source est épuisée. */
export interface MarketSlot {
  readonly tile: TileDef | null;
  readonly token: ShapeId | null;
}

/** Réserve finie de jetons : nombre de jetons par forme (§4.5). */
export type Pool = Readonly<Record<ShapeId, number>>;

export type GameMode = 'classic' | 'ranked' | 'custom' | 'offline';
export type BotLevel = 'easy' | 'medium' | 'cunning';

export interface SeatConfig {
  readonly id: SeatId;
  readonly name: string;
  /** Niveau de bot si le siège est tenu par un bot (§11.5), sinon `null`. */
  readonly bot: BotLevel | null;
}

export interface TeamConfig {
  readonly id: CampId;
  readonly name: string;
  /** Sièges de l'équipe, dans l'ordre de la composition. */
  readonly seats: readonly SeatId[];
}

/** Comportement d'un objectif brisé par une crasse (§10.6). */
export type BrokenObjectiveBehavior =
  | 'return-fixed-penalty'
  | 'return-value'
  | 'lost-zero'
  | 'to-saboteur'
  | 'locked';

export interface ObjectiveOptions {
  readonly enabled: boolean;
  /** Cartes du tirage initial (§10.5) : 1 haute et 2 faibles par défaut. */
  readonly initialHigh: number;
  readonly initialLow: number;
  readonly broken: BrokenObjectiveBehavior;
  /** Malus du comportement `return-fixed-penalty` (défaut 2, §10.6). */
  readonly brokenPenalty: number;
}

/** Options de règles réglables en custom (§12.4). */
export interface RuleOptions {
  /** §7.5 : `false` = vols désactivés. */
  readonly steals: boolean;
  /** §7.5 : `false` = sabotage et invalidations désactivés. */
  readonly sabotage: boolean;
  readonly autoReroll: boolean;
  readonly manualReroll: boolean;
  /** Jokers gagnés par bonus monochrome (§6.6) ; 0 = désactivé. */
  readonly monoBonus: number;
  readonly undo: boolean;
  /** Ordre de passage (§5.3). */
  readonly turnOrder: 'seats' | 'random';
  /** Ratio des capacités, index 0 = capacité 1 (§4.4, défaut 1:2:2). */
  readonly capacityRatio: readonly number[];
  /** Diviseur du seuil d'environnement `S = max(2, ⌈(T − m) / d⌉)` (§8.2, défaut 10). */
  readonly thresholdDivisor: number;
  readonly objectives: ObjectiveOptions;
  /** Visibilité des structures des autres camps (§13.4). Purement visuel. */
  readonly structureVisibility: 'own' | 'all';
  /** Visibilité des scores (§12.4). Purement visuel. */
  readonly scoreVisibility: 'live' | 'hidden';
}

export interface ModRef {
  readonly id: string;
  readonly version: string;
  /** Empreinte SHA-256 du contenu (§17.2). */
  readonly hash?: string;
}

export interface GameConfig {
  readonly mode: GameMode;
  readonly seats: readonly SeatConfig[];
  /** `null` = chacun pour soi. */
  readonly teams: readonly TeamConfig[] | null;
  /** Nombre de manches (§2). */
  readonly rounds: number;
  /** Minuteur du tour entier en ms, `null` = sans minuteur (§6.10). */
  readonly turnTimerMs: number | null;
  readonly marketSize: number;
  readonly startJokers: number;
  /** Tier choisi pour chaque forme active (§9.0). */
  readonly tierByShape: Readonly<Record<ShapeId, string>>;
  readonly activeShapes: readonly ShapeId[];
  readonly activeEnvs: readonly EnvId[];
  readonly options: RuleOptions;
  readonly mods: readonly ModRef[];
}

export interface CampState {
  readonly id: CampId;
  readonly seats: readonly SeatId[];
  /** Réserve de jokers du camp (commune à l'équipe, §11.1). */
  readonly jokers: number;
}

/** Compteurs permanents d'un camp : ils ne diminuent jamais (§10.1). */
export interface Counters {
  readonly steals: number;
  readonly invalidations: number;
  readonly monoBonuses: number;
  readonly tokensPlaced: number;
}

/** Tuile de départ d'un siège : cellules de capacité 1, 2 et 3 (§4.6). */
export interface StartTile {
  readonly seat: SeatId;
  readonly cells: readonly [TileDef, TileDef, TileDef];
}

export type GamePhase = 'objectives' | 'startTiles' | 'playing' | 'ended';

/** Actions provisoires du tour en cours, annulables jusqu'à la confirmation (§6.7). */
export interface TurnState {
  readonly seat: SeatId;
  readonly slot: number | null;
  readonly tilePlacement: {
    readonly q: number;
    readonly r: number;
    readonly rotation: Rotation;
  } | null;
  /** `null` = pas encore choisi ; `{ slot: null }` = « aucun jeton ». */
  readonly tokenChoice: { readonly slot: number | null } | null;
  readonly tokenPlacement: Hex | null;
  readonly manualRerollUsed: boolean;
  /** 1 ravitaillement d'objectifs maximum par tour (§10.5). */
  readonly resupplyUsed: boolean;
}

/** Étapes de la machine à états d'un tour (§6.1). */
export type TurnStep = 'chooseTile' | 'placeTile' | 'chooseToken' | 'placeToken' | 'confirm';

export interface GameState {
  readonly ruleSet: RuleSet;
  readonly config: GameConfig;
  readonly seed: string;
  readonly rngState: string;
  /** Dernier `seq` attribué (§2). */
  readonly seqCounter: number;
  /** Nombre de tuiles `T` de la pioche (§4.3). */
  readonly tileCount: number;
  /** Seuil de validité des environnements `S` (§8.2). */
  readonly threshold: number;
  readonly tiles: ReadonlyMap<CellKey, PlacedTile>;
  readonly tokens: ReadonlyMap<CellKey, PlacedToken>;
  /** Pioche complète ; les tuiles déjà tirées sont avant `deckPos`. Information cachée. */
  readonly deck: readonly TileDef[];
  readonly deckPos: number;
  readonly pool: Pool;
  readonly market: readonly MarketSlot[];
  readonly camps: Readonly<Record<CampId, CampState>>;
  readonly seatCamp: Readonly<Record<SeatId, CampId>>;
  /** Ordre de passage d'une manche (§11.1). */
  readonly turnCycle: readonly SeatId[];
  readonly totalTurns: number;
  /** Index du tour en cours (0-based) sur `totalTurns`. */
  readonly turnIndex: number;
  /** Ordre de pose des tuiles de départ (§5.6). */
  readonly startOrder: readonly SeatId[];
  readonly startTiles: Readonly<Record<SeatId, StartTile>>;
  readonly startIndex: number;
  readonly phase: GamePhase;
  readonly turn: TurnState | null;
  readonly counters: Readonly<Record<CampId, Counters>>;
  /** Objectifs secrets (§10), `null` s'ils sont désactivés. Information cachée par camp. */
  readonly objectives: ObjectivesState | null;
}

/** Actions d'un siège (§23.1). Le siège auteur fait partie de l'action. */
export type Action =
  | {
      readonly type: 'placeStartTile';
      readonly seat: SeatId;
      readonly q: number;
      readonly r: number;
      readonly orientation: number;
    }
  | { readonly type: 'reroll'; readonly seat: SeatId }
  | { readonly type: 'chooseTile'; readonly seat: SeatId; readonly slot: number }
  | {
      readonly type: 'placeTile';
      readonly seat: SeatId;
      readonly q: number;
      readonly r: number;
      readonly rotation: number;
    }
  | { readonly type: 'chooseToken'; readonly seat: SeatId; readonly slot: number | null }
  | { readonly type: 'placeToken'; readonly seat: SeatId; readonly q: number; readonly r: number }
  | { readonly type: 'undo'; readonly seat: SeatId }
  | { readonly type: 'confirm'; readonly seat: SeatId }
  | { readonly type: 'requestObjectives'; readonly seat: SeatId }
  | {
      readonly type: 'voteObjective';
      readonly seat: SeatId;
      readonly cardId: string;
      readonly keep: boolean;
    }
  /** Clôture d'un vote d'objectifs à l'expiration du minuteur (siège système du serveur). */
  | { readonly type: 'closeObjectiveVote'; readonly seat: SeatId };

export type ActionType = Action['type'];

/** Événements du moteur (§15.4), traduits en animations et sons sans couplage aux règles. */
export type GameEvent =
  | { readonly type: 'PhaseChanged'; readonly phase: GamePhase }
  | {
      readonly type: 'TilePlaced';
      readonly seat: SeatId;
      readonly camp: CampId;
      readonly tile: PlacedTile;
      readonly start: boolean;
    }
  | {
      readonly type: 'TokenPlaced';
      readonly seat: SeatId;
      readonly camp: CampId;
      readonly token: PlacedToken;
    }
  | {
      readonly type: 'Rerolled';
      readonly seat: SeatId;
      readonly mode: 'auto' | 'manual';
      readonly before: readonly (ShapeId | null)[];
      readonly after: readonly (ShapeId | null)[];
    }
  | {
      readonly type: 'MarketRefilled';
      readonly market: readonly MarketSlot[];
      readonly slots: readonly number[];
    }
  | {
      readonly type: 'JokerGained';
      readonly camp: CampId;
      readonly amount: number;
      readonly reason: 'monochrome';
    }
  | { readonly type: 'JokerSpent'; readonly camp: CampId; readonly amount: number }
  | {
      readonly type: 'TurnStarted';
      readonly seat: SeatId;
      readonly turnIndex: number;
      readonly round: number;
    }
  | { readonly type: 'TurnEnded'; readonly seat: SeatId; readonly turnIndex: number }
  | { readonly type: 'GameEnded' }
  | {
      readonly type: 'OwnershipChanged';
      readonly structureId: string;
      readonly kind: string;
      readonly shape?: ShapeId;
      readonly env?: EnvId;
      readonly members: readonly CellKey[];
      readonly from: CampId;
      readonly to: CampId;
    }
  | {
      readonly type: 'StructureInvalidated';
      readonly structureId: string;
      readonly kind: string;
      readonly shape?: ShapeId;
      readonly members: readonly CellKey[];
      readonly owner: CampId | null;
      readonly cause: 'invalidated' | 'blocked' | 'absorbed';
    }
  | {
      readonly type: 'ObjectiveStatusChanged';
      readonly camp: CampId;
      readonly cardId: string;
      readonly fulfilled: boolean;
      /** Camp dont le tour a provoqué le changement, `null` pour son propre camp. */
      readonly cause: CampId | null;
    }
  | {
      readonly type: 'ObjectivesDrawn';
      readonly kind: 'initial' | 'resupply';
      readonly camps: readonly CampId[];
    }
  | { readonly type: 'ObjectivesKept'; readonly camp: CampId; readonly count: number }
  | { readonly type: 'TokenBlocked'; readonly cell: CellKey; readonly by: string }
  | { readonly type: 'TokenAbsorbed'; readonly cell: CellKey; readonly by: string };

/** Tirage révélé par le serveur au client (§15.4 `DrawSource`). */
export type DrawRecord =
  | { readonly kind: 'tile'; readonly tile: TileDef | null }
  | { readonly kind: 'token'; readonly shape: ShapeId | null };

export type ActionResult =
  | {
      readonly ok: true;
      readonly state: GameState;
      readonly events: readonly GameEvent[];
      /** Tirages effectués pendant l'action, dans l'ordre, pour les rejouer chez le client. */
      readonly draws: readonly DrawRecord[];
    }
  | { readonly ok: false; readonly reason: string };
