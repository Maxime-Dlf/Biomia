/**
 * Validation des actions, sans effet de bord (§5.6, §6.2 à §6.8). Retourne un motif de refus ou
 * `null` si l'action est légale. Partagée par `applyAction` et `getLegalActions`.
 */
import { canHostToken, hasAdjacentTile, isTokenPlaceable } from '../core/board.ts';
import { cellKey } from '../core/hex.ts';
import type { PlacementProposal } from '../core/ruleset.ts';
import type { Action, GameState, SeatId } from '../core/types.ts';
import { canResupply, SYSTEM_SEAT } from '../objectives/flow.ts';
import { canManualReroll } from './market.ts';
import {
  activeSeat,
  campOf,
  chosenTile,
  chosenTokenShape,
  effectiveBoard,
  startTileCells,
  turnStep,
} from './state.ts';

const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n);
const inRange = (n: unknown, min: number, maxExclusive: number) =>
  isInt(n) && n >= min && n < maxExclusive;

function runValidators(state: GameState, proposal: PlacementProposal): string | null {
  for (const v of state.ruleSet.validators) {
    const reason = v.validate(state, proposal);
    if (reason !== null) return reason;
  }
  return null;
}

/** Pose d'une tuile de départ (§5.6). */
export function checkStartPlacement(
  state: GameState,
  seat: SeatId,
  q: number,
  r: number,
  orientation: number,
): string | null {
  if (!inRange(orientation, 0, 6)) return 'invalid-orientation';
  if (!isInt(q) || !isInt(r)) return 'invalid-cell';
  const cells = startTileCells(state, seat, q, r, orientation);
  if (state.tiles.size === 0) {
    // J1 pose sa cellule de capacité 1 en (0, 0).
    if (q !== 0 || r !== 0) return 'first-start-tile-must-be-at-origin';
  } else {
    if (cells.some((c) => state.tiles.has(cellKey(c.q, c.r)))) return 'cell-occupied';
    if (!cells.some((c) => hasAdjacentTile(state.tiles, c.q, c.r))) return 'not-adjacent';
  }
  for (const c of cells) {
    const reason = runValidators(state, { kind: 'tile', seat, q: c.q, r: c.r, tile: c.def });
    if (reason !== null) return reason;
  }
  return null;
}

/** Votes d'objectifs (§10.5) : tout siège d'un camp concerné par le vote en cours. */
function checkObjectiveVote(
  state: GameState,
  action: Extract<Action, { type: 'voteObjective' | 'closeObjectiveVote' }>,
): string | null {
  const vote = state.objectives?.vote;
  if (!vote) return 'no-objective-vote';
  if (action.type === 'closeObjectiveVote')
    return action.seat === SYSTEM_SEAT ? null : 'system-only';
  if (typeof action.keep !== 'boolean') return 'invalid-vote';
  const camp = state.seatCamp[action.seat];
  if (camp === undefined) return 'unknown-seat';
  const cards = vote.draws[camp];
  if (!cards) return 'not-voting';
  return cards.some((c) => c.id === action.cardId) ? null : 'unknown-card';
}

export function checkAction(state: GameState, action: Action): string | null {
  if (action.type === 'voteObjective' || action.type === 'closeObjectiveVote') {
    return checkObjectiveVote(state, action);
  }
  if (state.objectives?.vote) return 'objective-vote-pending';
  const seat = activeSeat(state);
  if (seat === null) return 'no-active-seat';
  if (action.seat !== seat) return 'not-your-turn';

  if (action.type === 'placeStartTile') {
    if (state.phase !== 'startTiles') return 'wrong-phase';
    return checkStartPlacement(state, seat, action.q, action.r, action.orientation);
  }
  if (state.phase !== 'playing' || state.turn === null) return 'wrong-phase';
  const turn = state.turn;
  const step = turnStep(turn);
  const options = state.config.options;
  const m = state.market.length;

  switch (action.type) {
    case 'reroll': {
      if (!options.manualReroll) return 'manual-reroll-disabled';
      if (turn.manualRerollUsed) return 'manual-reroll-already-used';
      // Disponible de `début` jusqu'au choix du jeton (§6.2).
      if (step === 'placeToken' || step === 'confirm') return 'manual-reroll-too-late';
      return canManualReroll(state.market, state.pool) ? null : 'manual-reroll-unavailable';
    }
    case 'chooseTile': {
      if (step !== 'chooseTile') return 'wrong-step';
      if (!inRange(action.slot, 0, m)) return 'invalid-slot';
      return state.market[action.slot]!.tile === null ? 'empty-slot' : null;
    }
    case 'placeTile': {
      if (step !== 'placeTile') return 'wrong-step';
      if (!inRange(action.rotation, 0, 6)) return 'invalid-rotation';
      if (!isInt(action.q) || !isInt(action.r)) return 'invalid-cell';
      if (state.tiles.has(cellKey(action.q, action.r))) return 'cell-occupied';
      // Aucune contrainte de correspondance d'arêtes (§6.3).
      if (!hasAdjacentTile(state.tiles, action.q, action.r)) return 'not-adjacent';
      return runValidators(state, {
        kind: 'tile',
        seat,
        q: action.q,
        r: action.r,
        tile: chosenTile(state)!,
      });
    }
    case 'chooseToken': {
      if (step !== 'chooseToken') return 'wrong-step';
      if (action.slot === null) return null;
      if (!inRange(action.slot, 0, m)) return 'invalid-slot';
      const shape = state.market[action.slot]!.token;
      if (shape === null) return 'empty-slot';
      const board = effectiveBoard(state);
      // Un jeton non plaçable ne peut pas être sélectionné (§6.4).
      if (!isTokenPlaceable(board.tiles, board.tokens, shape)) return 'token-not-placeable';
      if (action.slot !== turn.slot && state.camps[campOf(state, seat)]!.jokers < 1)
        return 'no-joker';
      return null;
    }
    case 'placeToken': {
      if (step !== 'placeToken') return 'wrong-step';
      if (!isInt(action.q) || !isInt(action.r)) return 'invalid-cell';
      const shape = chosenTokenShape(state)!;
      const board = effectiveBoard(state);
      if (!canHostToken(board.tiles, board.tokens, cellKey(action.q, action.r), shape))
        return 'cannot-host-token';
      return runValidators(state, { kind: 'token', seat, q: action.q, r: action.r, shape });
    }
    case 'undo': {
      if (!options.undo) return 'undo-disabled';
      return step === 'chooseTile' ? 'nothing-to-undo' : null;
    }
    case 'confirm':
      return step === 'confirm' ? null : 'wrong-step';
    case 'requestObjectives': {
      if (!state.objectives || !options.objectives.enabled) return 'objectives-disabled';
      if (turn.resupplyUsed) return 'resupply-already-used';
      return canResupply(state, campOf(state, seat)) ? null : 'objectives-not-all-fulfilled';
    }
  }
}
