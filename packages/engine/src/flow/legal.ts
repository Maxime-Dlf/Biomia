/**
 * `getLegalActions` (§15.4) : toutes les actions légales d'un siège. Utilisé par `autoPlay`, les
 * bots (§11.5) et les tests de simulation.
 */
import { frontierCells, tokenTargets } from '../core/board.ts';
import { rotateVector } from '../core/hex.ts';
import type { Action, GameState, SeatId } from '../core/types.ts';
import { checkAction, checkStartPlacement } from './check.ts';
import {
  activeSeat,
  chosenTokenShape,
  effectiveBoard,
  START_TILE_OFFSETS,
  turnStep,
} from './state.ts';

const ROTATIONS = [0, 1, 2, 3, 4, 5] as const;

/** Poses légales de la tuile de départ (§5.6), sans doublon. */
export function legalStartPlacements(state: GameState, seat: SeatId): Action[] {
  if (state.tiles.size === 0) {
    return ROTATIONS.map((orientation) => ({
      type: 'placeStartTile',
      seat,
      q: 0,
      r: 0,
      orientation,
    }));
  }
  const seen = new Set<string>();
  const out: Action[] = [];
  for (const f of frontierCells(state.tiles)) {
    for (const orientation of ROTATIONS) {
      for (const offset of START_TILE_OFFSETS) {
        const o = rotateVector(offset, orientation);
        const q = f.q - o.q;
        const r = f.r - o.r;
        const id = `${q},${r},${orientation}`;
        if (seen.has(id)) continue;
        seen.add(id);
        if (checkStartPlacement(state, seat, q, r, orientation) === null) {
          out.push({ type: 'placeStartTile', seat, q, r, orientation });
        }
      }
    }
  }
  return out;
}

/** Votes possibles d'un siège sur les cartes de son camp encore sans vote (§10.5). */
export function legalObjectiveVotes(state: GameState, seat: SeatId): Action[] {
  const vote = state.objectives?.vote;
  const camp = state.seatCamp[seat];
  if (!vote || camp === undefined) return [];
  const mine = vote.votes[seat] ?? {};
  return (vote.draws[camp] ?? [])
    .filter((c) => mine[c.id] === undefined)
    .flatMap((c) => [
      { type: 'voteObjective', seat, cardId: c.id, keep: true } as const,
      { type: 'voteObjective', seat, cardId: c.id, keep: false } as const,
    ]);
}

export function getLegalActions(state: GameState, seat: SeatId): Action[] {
  if (state.objectives?.vote) return legalObjectiveVotes(state, seat);
  if (activeSeat(state) !== seat) return [];
  if (state.phase === 'startTiles') return legalStartPlacements(state, seat);
  if (state.phase !== 'playing' || state.turn === null) return [];

  const candidates: Action[] = [
    { type: 'reroll', seat },
    { type: 'undo', seat },
    { type: 'requestObjectives', seat },
  ];
  switch (turnStep(state.turn)) {
    case 'chooseTile':
      for (let slot = 0; slot < state.market.length; slot++) {
        candidates.push({ type: 'chooseTile', seat, slot });
      }
      break;
    case 'placeTile':
      for (const c of frontierCells(state.tiles)) {
        for (const rotation of ROTATIONS) {
          candidates.push({ type: 'placeTile', seat, q: c.q, r: c.r, rotation });
        }
      }
      break;
    case 'chooseToken':
      candidates.push({ type: 'chooseToken', seat, slot: null });
      for (let slot = 0; slot < state.market.length; slot++) {
        candidates.push({ type: 'chooseToken', seat, slot });
      }
      break;
    case 'placeToken': {
      const board = effectiveBoard(state);
      for (const c of tokenTargets(board.tiles, board.tokens, chosenTokenShape(state)!)) {
        candidates.push({ type: 'placeToken', seat, q: c.q, r: c.r });
      }
      break;
    }
    case 'confirm':
      candidates.push({ type: 'confirm', seat });
      break;
  }
  return candidates.filter((a) => checkAction(state, a) === null);
}
