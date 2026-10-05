/**
 * Diffusion des événements (§15.4) : `ObjectiveStatusChanged` est privé (objectifs secrets, §10.1)
 * et n'est envoyé qu'au camp concerné ; tous les autres événements sont publics.
 */
import type { CampId, GameEvent } from '@crassecadia/engine';

export function eventsForCamp(
  events: readonly GameEvent[],
  camp: CampId | null,
  revealed: boolean,
): GameEvent[] {
  return events.filter(
    (e) => e.type !== 'ObjectiveStatusChanged' || revealed || (camp !== null && e.camp === camp),
  );
}
