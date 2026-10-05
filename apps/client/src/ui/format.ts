/**
 * Formatage pour l'interface : noms de sièges, camps, formes, environnements et objectifs.
 */
import type { CampId, GameState, HeldObjective, ObjectiveCard, SeatId } from '@crassecadia/engine';
import { localized, t } from '../i18n/i18n.svelte.ts';

export function seatName(state: GameState, seat: SeatId): string {
  return state.config.seats.find((s) => s.id === seat)?.name ?? seat;
}

export function campName(state: GameState, camp: CampId): string {
  const team = state.config.teams?.find((t) => t.id === camp);
  if (team) return team.name;
  return seatName(state, camp);
}

export function shapeName(state: GameState, shape: string): string {
  return localized(state.ruleSet.shapes.find((s) => s.id === shape)?.name, shape);
}

export function envName(state: GameState, env: string): string {
  return localized(state.ruleSet.envs.find((e) => e.id === env)?.name, env);
}

/** Nom d'un objectif avec ses paramètres `{F}`, `{C}` et `N` (§10.3). */
export function objectiveName(state: GameState, card: ObjectiveCard): string {
  const template = state.ruleSet.objectiveTemplates.find((x) => x.id === card.templateId);
  let name = localized(template?.name, card.templateId);
  const f = card.params.F;
  const c = card.params.C;
  if (typeof f === 'string') name = name.replace('{F}', shapeName(state, f));
  if (typeof c === 'string') name = name.replace('{C}', envName(state, c));
  return card.params.N !== undefined ? `${name} (N = ${card.params.N})` : name;
}

export function objectiveStatus(held: HeldObjective): {
  label: string;
  tone: 'ok' | 'warn' | 'bad' | 'neutral';
} {
  if (held.fulfilled) return { label: t('objectives.fulfilled'), tone: 'ok' };
  if (held.lost) return { label: t('objectives.lost'), tone: 'bad' };
  if (held.brokenBy !== null) return { label: t('objectives.broken'), tone: 'warn' };
  return { label: t('objectives.inProgress'), tone: 'neutral' };
}
