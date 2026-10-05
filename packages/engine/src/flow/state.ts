/**
 * Lectures dérivées de l'état : siège actif, étape du tour (§6.1), plateau effectif.
 */
import { type CellKey, cellKey, type Hex, mod6, type Rotation, rotateVector } from '../core/hex.ts';
import type {
  CampId,
  GameState,
  PlacedTile,
  PlacedToken,
  SeatId,
  ShapeId,
  TileDef,
  TurnState,
  TurnStep,
} from '../core/types.ts';
import { seatsWithMissingVotes } from '../objectives/flow.ts';

/** Siège dont c'est le tour, ou `null` (phase sans tour, ex. vote simultané des objectifs). */
export function activeSeat(state: GameState): SeatId | null {
  if (state.phase === 'startTiles') return state.startOrder[state.startIndex] ?? null;
  if (state.phase === 'playing') return state.turn?.seat ?? null;
  return null;
}

/**
 * Sièges qui peuvent agir maintenant : votants d'un vote d'objectifs en cours (§10.5), sinon le
 * siège actif.
 */
export function actingSeats(state: GameState): SeatId[] {
  if (state.objectives?.vote) return seatsWithMissingVotes(state);
  const seat = activeSeat(state);
  return seat === null ? [] : [seat];
}

export function campOf(state: GameState, seat: SeatId): CampId {
  const camp = state.seatCamp[seat];
  if (camp === undefined) throw new Error(`Siège inconnu : ${seat}`);
  return camp;
}

/** Manche en cours (1-based). */
export function currentRound(state: GameState): number {
  return Math.floor(state.turnIndex / state.turnCycle.length) + 1;
}

/** Étape du tour déduite des actions provisoires (§6.1). */
export function turnStep(turn: TurnState): TurnStep {
  if (turn.slot === null) return 'chooseTile';
  if (turn.tilePlacement === null) return 'placeTile';
  if (turn.tokenChoice === null) return 'chooseToken';
  if (turn.tokenChoice.slot !== null && turn.tokenPlacement === null) return 'placeToken';
  return 'confirm';
}

/** Forme du jeton choisi pour ce tour, ou `null` (pas encore choisi, ou « aucun jeton »). */
export function chosenTokenShape(state: GameState): ShapeId | null {
  const choice = state.turn?.tokenChoice;
  if (!choice || choice.slot === null) return null;
  return state.market[choice.slot]?.token ?? null;
}

export function chosenTile(state: GameState): TileDef | null {
  const slot = state.turn?.slot;
  return slot === null || slot === undefined ? null : (state.market[slot]?.tile ?? null);
}

export interface EffectiveBoard {
  readonly tiles: ReadonlyMap<CellKey, PlacedTile>;
  readonly tokens: ReadonlyMap<CellKey, PlacedToken>;
  readonly seqCounter: number;
}

/**
 * Plateau incluant les poses provisoires du tour (§6.7, §6.8), avec les `seq` qu'elles recevront
 * à la confirmation. Sert à la légalité du jeton, aux aperçus et aux fantômes.
 */
export function effectiveBoard(state: GameState): EffectiveBoard {
  const turn = state.turn;
  if (state.phase !== 'playing' || turn === null || turn.tilePlacement === null) {
    return { tiles: state.tiles, tokens: state.tokens, seqCounter: state.seqCounter };
  }
  let seq = state.seqCounter;
  const tile = chosenTile(state)!;
  const { q, r, rotation } = turn.tilePlacement;
  const tiles = new Map(state.tiles);
  tiles.set(cellKey(q, r), { def: tile, q, r, rotation, placedBy: turn.seat, seq: ++seq });
  let tokens: ReadonlyMap<CellKey, PlacedToken> = state.tokens;
  const shape = chosenTokenShape(state);
  if (shape !== null && turn.tokenPlacement !== null) {
    const p = turn.tokenPlacement;
    const next = new Map(state.tokens);
    next.set(cellKey(p.q, p.r), { shape, q: p.q, r: p.r, placedBy: turn.seat, seq: ++seq });
    tokens = next;
  }
  return { tiles, tokens, seqCounter: seq };
}

/** Forme de base d'une tuile de départ, avant rotation : capacités 1, 2, 3 (§4.6). */
export const START_TILE_OFFSETS: readonly Hex[] = [
  { q: 0, r: 0 },
  { q: 1, r: 0 },
  { q: 1, r: -1 },
];

export interface StartCell {
  readonly q: number;
  readonly r: number;
  readonly def: TileDef;
  readonly rotation: Rotation;
}

/**
 * Cellules d'une tuile de départ posée avec sa cellule de capacité 1 en `(q, r)` et l'orientation
 * `o` (§5.6). Les vecteurs tournent de `o` pas (§3) et chaque cellule tourne avec eux : la pièce
 * reste rigide. La rotation vectorielle étant horaire à l'écran, la rotation des arêtes vaut `−o`.
 */
export function startTileCells(
  state: GameState,
  seat: SeatId,
  q: number,
  r: number,
  orientation: number,
): StartCell[] {
  const start = state.startTiles[seat];
  if (!start) throw new Error(`Pas de tuile de départ pour ${seat}`);
  const rotation = mod6(-orientation) as Rotation;
  return START_TILE_OFFSETS.map((offset, i) => {
    const o = rotateVector(offset, orientation);
    return { q: q + o.q, r: r + o.r, def: start.cells[i]!, rotation };
  });
}
