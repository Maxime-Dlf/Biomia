/**
 * Mod interne `objectives-core` : catalogue officiel (§10.3) et décompte définitif des objectifs en
 * fin de partie (étape 6 du pipeline, §7.4, §10.6).
 */
import { type Award, objectiveAwards, type Scorer } from '@crassecadia/engine';
import type { InternalMod } from '../mod.ts';
import { OFFICIAL_OBJECTIVES } from './catalogue.ts';

export * from './catalogue.ts';

/** §10.6 : +valeur si rempli, sinon −valeur, −2 si brisé par un adversaire (ou variante custom). */
export const objectivesScorer: Scorer = {
  id: 'core:objectives',
  stage: 'objectives',
  meta: { minSize: 0, maxSize: null, canInvalidate: false, sizeUnit: 'tokens' },
  priority: 0,
  run: (ctx) => {
    const objectives = ctx.state.objectives;
    if (!objectives) return {};
    const awards: Award[] = [];
    for (const [camp, held] of Object.entries(objectives.byCamp)) {
      for (const h of held) {
        for (const a of objectiveAwards(ctx.state, camp, h)) {
          if (a.points !== 0) {
            awards.push({
              camp: a.camp,
              points: a.points,
              category: 'objectives',
              source: h.card.id,
              reason: 'objective',
            });
          }
        }
      }
    }
    return { awards };
  },
};

export const objectivesCoreMod: InternalMod = {
  id: 'objectives-core',
  version: '1.0.0',
  dependencies: ['core'],
  scorers: [objectivesScorer],
  objectives: OFFICIAL_OBJECTIVES,
};
