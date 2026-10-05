/**
 * Classement de fin de partie (§11.3) : total, puis points de jetons, puis jokers restants ;
 * à égalité parfaite, victoire partagée [PROPOSITION].
 */
import type { CampId, GameState } from '../core/types.ts';
import type { ScoreReport } from './types.ts';

/** Groupes de camps à égalité, du premier au dernier. */
export function finalRanking(state: GameState, report: ScoreReport): CampId[][] {
  const key = (camp: CampId) => {
    const s = report.byCamp[camp];
    const tokens = s ? Object.values(s.tokens).reduce((a, b) => a + b, 0) : 0;
    return [s?.total ?? 0, tokens, state.camps[camp]?.jokers ?? 0] as const;
  };
  const compare = (a: CampId, b: CampId) => {
    const ka = key(a);
    const kb = key(b);
    return kb[0] - ka[0] || kb[1] - ka[1] || kb[2] - ka[2];
  };
  const camps = Object.keys(state.camps).sort((a, b) => compare(a, b) || (a < b ? -1 : 1));
  const groups: CampId[][] = [];
  for (const camp of camps) {
    const last = groups[groups.length - 1];
    if (last && compare(last[0]!, camp) === 0) last.push(camp);
    else groups.push([camp]);
  }
  return groups;
}
