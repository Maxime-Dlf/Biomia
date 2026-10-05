/**
 * Politique aléatoire : une action légale tirée au hasard, en évitant les boucles de retour arrière.
 * Sert aux simulations massives (§20.1) et de base au bot Facile (§11.5).
 */
import type { Rng } from '../core/rng.ts';
import type { Action, GameState, SeatId } from '../core/types.ts';
import { getLegalActions } from '../flow/legal.ts';

export interface RandomPolicyOptions {
  /** Probabilité (en %) de tenter un retour arrière quand il est possible. */
  readonly undoPercent: number;
  /** Probabilité (en %) d'utiliser le reroll manuel quand il est possible. */
  readonly rerollPercent: number;
}

const DEFAULTS: RandomPolicyOptions = { undoPercent: 5, rerollPercent: 50 };

export function randomAction(
  state: GameState,
  seat: SeatId,
  rng: Rng,
  options: RandomPolicyOptions = DEFAULTS,
): Action | null {
  const legal = getLegalActions(state, seat);
  if (legal.length === 0) return null;
  const undo = legal.find((a) => a.type === 'undo');
  if (undo && rng.int(100) < options.undoPercent) return undo;
  const reroll = legal.find((a) => a.type === 'reroll');
  if (reroll && rng.int(100) < options.rerollPercent) return reroll;
  const progress = legal.filter((a) => a.type !== 'undo' && a.type !== 'reroll');
  return progress.length > 0 ? rng.pick(progress) : rng.pick(legal);
}
