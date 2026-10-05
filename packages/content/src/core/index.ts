/**
 * Mod interne `core` : 5 formes et 5 environnements par défaut (§4.1), générateur officiel
 * (§4.4), environnements (§8.3), bonus de fin (§8.4) et jokers restants (§4.2).
 */
import {
  type Award,
  balancedTileGenerator,
  type Scorer,
  type StructureResult,
} from '@crassecadia/engine';
import { CORE_ENVS, SHAPE } from '../ids.ts';
import type { InternalMod } from '../mod.ts';

const NO_META = { minSize: 0, maxSize: null, canInvalidate: false, sizeUnit: 'tiles' } as const;

/** §8.3 : chaque camp marque la somme des tailles de ses environnements valides. */
export const environmentsScorer: Scorer = {
  id: 'core:environments',
  stage: 'environments',
  meta: { minSize: 2, maxSize: null, canInvalidate: false, sizeUnit: 'tiles' },
  priority: 0,
  run: (ctx) => ({
    structures: ctx.environments.map(
      (env): StructureResult => ({
        id: env.id,
        kind: 'environment',
        scorer: 'core:environments',
        env: env.env,
        members: env.tiles,
        owner: env.owner,
        points: env.valid ? env.size : 0,
        status: !env.valid ? 'pending' : ctx.neutralizedEnvs.has(env.id) ? 'neutralized' : 'valid',
        seniority: env.seniority,
      }),
    ),
  }),
};

/**
 * §8.4 : sur l'état final, pour chaque couleur, les environnements valides et non neutralisés
 * triés par taille décroissante puis ancienneté : +2 au 1ᵉʳ, +1 au 2ᵉ.
 */
export const endBonusesScorer: Scorer = {
  id: 'core:end-bonuses',
  stage: 'end-bonuses',
  meta: NO_META,
  priority: 0,
  run: (ctx) => {
    const awards: Award[] = [];
    const colors = [...new Set(ctx.environments.map((e) => e.env))].sort();
    for (const color of colors) {
      const ranked = ctx.environments
        .filter((e) => e.env === color && e.valid && !ctx.neutralizedEnvs.has(e.id))
        .sort((a, b) => b.size - a.size || a.seniority - b.seniority);
      [2, 1].forEach((points, rank) => {
        const env = ranked[rank];
        if (env)
          awards.push({
            camp: env.owner,
            points,
            category: 'endBonuses',
            source: env.id,
            reason: `rank-${rank + 1}`,
          });
      });
    }
    return { awards };
  },
};

/** §4.2 : chaque joker non utilisé vaut 1 point en fin de partie. */
export const jokersScorer: Scorer = {
  id: 'core:jokers',
  stage: 'jokers',
  meta: NO_META,
  priority: 0,
  run: (ctx) => ({
    awards: Object.values(ctx.state.camps)
      .filter((c) => c.jokers > 0)
      .map((c): Award => ({ camp: c.id, points: c.jokers, category: 'jokers', reason: 'jokers' })),
  }),
};

const SHAPE_NAMES: Record<string, { fr: string; en: string }> = {
  [SHAPE.square]: { fr: 'Carré', en: 'Square' },
  [SHAPE.triangle]: { fr: 'Triangle', en: 'Triangle' },
  [SHAPE.heart]: { fr: 'Cœur', en: 'Heart' },
  [SHAPE.circle]: { fr: 'Rond', en: 'Circle' },
  [SHAPE.star]: { fr: 'Étoile', en: 'Star' },
};

export const coreMod: InternalMod = {
  id: 'core',
  version: '1.0.0',
  shapes: Object.values(SHAPE).map((id) => ({ id, name: SHAPE_NAMES[id]! })),
  // Noms provisoires : fixés par la direction artistique (§14.7, livrables de cadrage).
  envs: CORE_ENVS.map((id, i) => ({
    id,
    name: { fr: `Environnement ${i}`, en: `Environment ${i}` },
  })),
  generators: { tiles: balancedTileGenerator },
  scorers: [environmentsScorer, endBonusesScorer, jokersScorer],
};
