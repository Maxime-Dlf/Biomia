/**
 * Replays (§15.4) : configuration + graine + liste des actions. Le moteur déterministe les rejoue
 * à l'identique.
 */
import type { RuleSet } from '../core/ruleset.ts';
import type { Action, GameConfig, GameEvent, GameState } from '../core/types.ts';
import { applyAction } from '../flow/apply.ts';
import { createGame } from '../flow/setup.ts';

export interface Replay {
  readonly config: GameConfig;
  readonly seed: string;
  readonly actions: readonly Action[];
}

export class ReplayError extends Error {
  constructor(
    readonly index: number,
    readonly reason: string,
  ) {
    super(`Action ${index} refusée au rejeu : ${reason}`);
    this.name = 'ReplayError';
  }
}

/** Rejoue toutes les actions et retourne l'état final et les événements, dans l'ordre. */
export function replayGame(
  ruleSet: RuleSet,
  replay: Replay,
): { state: GameState; events: GameEvent[] } {
  let state = createGame(replay.config, ruleSet, replay.seed);
  const events: GameEvent[] = [];
  replay.actions.forEach((action, i) => {
    const res = applyAction(state, action);
    if (!res.ok) throw new ReplayError(i, res.reason);
    state = res.state;
    events.push(...res.events);
  });
  return { state, events };
}
