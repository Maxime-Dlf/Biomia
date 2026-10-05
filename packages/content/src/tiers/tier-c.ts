/**
 * Tier C — Sabotage et conflit direct (§9.4) [PLAYTEST].
 * Résolution simultanée : les effets de l'étape 1 sont évalués sur le plateau brut puis appliqués
 * tous ensemble par le moteur ; un jeton bloqué ou absorbé perd ses points mais garde son effet.
 */
import {
  type Adjustment,
  type Award,
  assignLines,
  type CampId,
  cellKey,
  DIRECTIONS,
  type EnvironmentInfo,
  type Exclusion,
  latestOf,
  type ScoredToken,
  type Scorer,
  type ShapeId,
  type StructureResult,
  tableValue,
  tokenStructure,
} from '@crassecadia/engine';
import { SHAPE } from '../ids.ts';
import type { TierDefinition } from '../mod.ts';
import { gridOf, invalidatedGroups, meta, neighborsIn, neighborTokens, owned } from './shared.ts';
import { HEART_CHAIN_TABLE } from './tier-d.ts';

/** §9.4.1 Barème de base par mur. */
export const WALL_TABLE = [0, 0, 0, 6, 9, 12, 15];
/** §9.4.1 Bonus par environnement neutralisé. */
export const NEUTRALIZATION_POINTS = 5;

/** §9.4.1 Carré — mur de rupture (étapes 2 et 3). */
export function squareC(shape: ShapeId): Scorer[] {
  const id = `C/square[${shape}]`;
  return [
    {
      id,
      stage: 'structures',
      shape,
      meta: meta(3, null, false),
      priority: 0,
      run: (ctx) => ({
        structures: assignLines(ctx.tokensOf(shape)).map((run) =>
          run.members.length >= 3
            ? owned(
                ctx,
                id,
                'wall',
                run.members,
                tableValue(WALL_TABLE, run.members.length),
                'valid',
                {
                  data: { axis: run.family ?? -1 },
                },
              )
            : owned(ctx, id, 'free', run.members, 0, 'pending'),
        ),
      }),
    },
    {
      id: `${id}/neutralize`,
      stage: 'post-effects',
      shape,
      meta: meta(3, null, false),
      priority: 10,
      run: (ctx) => {
        const neutralize: string[] = [];
        const awards: Award[] = [];
        // Environnements valides de chaque tuile, pour compter les tuiles portant un carré du mur.
        const envsByTile = new Map<string, EnvironmentInfo[]>();
        for (const env of ctx.environments) {
          if (!env.valid) continue;
          for (const k of env.tiles) envsByTile.set(k, [...(envsByTile.get(k) ?? []), env]);
        }
        for (const wall of ctx.structures) {
          if (wall.scorer !== id || wall.kind !== 'wall' || wall.owner === null) continue;
          const counts = new Map<EnvironmentInfo, number>();
          for (const cell of wall.members) {
            for (const env of envsByTile.get(cell) ?? [])
              counts.set(env, (counts.get(env) ?? 0) + 1);
          }
          const hit = [...counts]
            .filter(([env, n]) => n >= 2 && env.owner !== wall.owner)
            .map(([env]) => env)
            .sort((a, b) => a.seniority - b.seniority || (a.id < b.id ? -1 : 1));
          for (const env of hit) {
            neutralize.push(env.id);
            awards.push({
              camp: wall.owner,
              points: NEUTRALIZATION_POINTS,
              category: 'effects',
              source: wall.id,
              reason: 'neutralization',
            });
          }
        }
        return { neutralize, awards };
      },
    },
  ];
}

/** §9.4.2 Barème de base par flèche. */
export const ARROW_TABLE = [0, 0, 0, 4, 6, 8];
/** §9.4.2 Siphon maximal par extrémité. */
export const SIPHON_MAX = 4;

/** §9.4.2 Triangle — flèche prédatrice (étapes 2 et 3). */
export function triangleC(shape: ShapeId): Scorer[] {
  const id = `C/triangle[${shape}]`;
  return [
    {
      id,
      stage: 'structures',
      shape,
      meta: meta(3, null, false),
      priority: 0,
      run: (ctx) => ({
        structures: assignLines(ctx.tokensOf(shape)).map((run) =>
          run.members.length >= 3
            ? owned(
                ctx,
                id,
                'arrow',
                run.members,
                tableValue(ARROW_TABLE, run.members.length),
                'valid',
                {
                  data: { axis: run.family ?? -1 },
                },
              )
            : owned(ctx, id, 'free', run.members, 0, 'pending'),
        ),
      }),
    },
    {
      id: `${id}/siphon`,
      stage: 'post-effects',
      shape,
      meta: meta(3, null, false),
      priority: 20,
      run: (ctx) => {
        // Points restants de chaque structure, mis à jour au fil des siphons.
        const remaining = new Map(ctx.structures.map((s) => [s.id, s.points]));
        const owner = new Map<string, StructureResult>();
        for (const s of ctx.structures) {
          if (s.shape === undefined || s.kind === 'excluded' || s.kind === 'neutral') continue;
          for (const m of s.members) owner.set(m, s);
        }
        const adjustments: Adjustment[] = [];
        const awards: Award[] = [];
        const arrows = ctx.structures
          .filter((s) => s.scorer === id && s.kind === 'arrow' && s.owner !== null)
          .sort((a, b) => a.seniority - b.seniority);
        for (const arrow of arrows) {
          const d = DIRECTIONS[Number(arrow.data?.axis ?? 0)]!;
          const first = ctx.allTokens.get(arrow.members[0]!)!;
          const last = ctx.allTokens.get(arrow.members[arrow.members.length - 1]!)!;
          const ends = [cellKey(first.q - d.q, first.r - d.r), cellKey(last.q + d.q, last.r + d.r)];
          for (const cell of ends) {
            if (!ctx.tokens.has(cell)) continue;
            const target = owner.get(cell);
            if (!target || target.owner === null || target.owner === arrow.owner) continue;
            const left = remaining.get(target.id) ?? 0;
            const amount = Math.min(SIPHON_MAX, left);
            if (amount <= 0) continue;
            remaining.set(target.id, left - amount);
            adjustments.push({ structureId: target.id, delta: -amount, reason: 'siphon' });
            awards.push({
              camp: arrow.owner!,
              points: amount,
              category: 'effects',
              source: arrow.id,
              reason: 'siphon',
            });
          }
        }
        return { adjustments, awards };
      },
    },
  ];
}

/** Camps présents dans une chaîne de cœurs, avec leur nombre de cœurs et leur cœur le plus récent. */
function campsInChain(
  chain: readonly ScoredToken[],
): { camp: CampId; count: number; latest: number }[] {
  const byCamp = new Map<CampId, ScoredToken[]>();
  for (const h of chain) byCamp.set(h.camp, [...(byCamp.get(h.camp) ?? []), h]);
  return [...byCamp]
    .map(([camp, hearts]) => ({ camp, count: hearts.length, latest: latestOf(hearts).seq }))
    .sort((a, b) => b.count - a.count || a.latest - b.latest || (a.camp < b.camp ? -1 : 1));
}

/** §9.4.3 Cœur — parasitage (étapes 2 et 3). */
export function heartC(shape: ShapeId): Scorer[] {
  const id = `C/heart[${shape}]`;
  return [
    {
      id,
      stage: 'structures',
      shape,
      meta: meta(1, null, false),
      priority: 0,
      run: (ctx) => ({
        // Propriétaire : le camp qui a le plus de cœurs ; égalité → cœur le plus récent le plus ancien.
        structures: ctx.components(shape).map((chain) =>
          tokenStructure(id, 'chain', chain, {
            owner: campsInChain(chain)[0]!.camp,
            points: tableValue(HEART_CHAIN_TABLE, chain.length),
            status: 'valid',
          }),
        ),
      }),
    },
    {
      id: `${id}/parasites`,
      stage: 'post-effects',
      shape,
      meta: meta(1, null, false),
      priority: 30,
      run: (ctx) => {
        const adjustments: Adjustment[] = [];
        const awards: Award[] = [];
        for (const chain of ctx.structures) {
          if (chain.scorer !== id || chain.kind !== 'chain' || chain.owner === null) continue;
          const hearts = chain.members.map((k) => ctx.allTokens.get(k)!);
          let left = chain.points;
          for (const p of campsInChain(hearts)) {
            if (p.camp === chain.owner) continue;
            const take = Math.min(2 * p.count, left);
            if (take <= 0) continue;
            left -= take;
            adjustments.push({ structureId: chain.id, delta: -take, reason: 'parasite' });
            awards.push({
              camp: p.camp,
              points: take,
              category: 'effects',
              source: chain.id,
              reason: 'parasite',
            });
          }
        }
        return { adjustments, awards };
      },
    },
  ];
}

/** §9.4.4 Points par jeton bloqué et plafond par rond. */
export const BLOCK_POINTS = 4;
export const BLOCK_CAP = 12;

/** §9.4.4 Rond — balise piégée (étape 1). */
export function circleC(shape: ShapeId): Scorer[] {
  const id = `C/circle[${shape}]`;
  return [
    {
      id,
      stage: 'pre-effects',
      shape,
      meta: { ...meta(1, 1, true), supportShapes: true },
      priority: 10,
      run: (ctx) => {
        const circles = ctx.tokensOf(shape);
        const grid = gridOf(circles);
        const defused = circles.filter((c) => neighborsIn(c, grid).length > 0);
        const defusedKeys = new Set(defused.map((c) => c.key));
        const structures: StructureResult[] = invalidatedGroups(ctx, id, defused);
        const exclusions: Exclusion[] = [];
        for (const c of circles) {
          if (defusedKeys.has(c.key)) continue;
          const blocked = neighborTokens(ctx, c)
            .filter((t) => t.shape !== shape && t.camp !== c.camp)
            .map((t) => t.key);
          const structure = owned(
            ctx,
            id,
            'beacon',
            [c],
            Math.min(BLOCK_CAP, BLOCK_POINTS * blocked.length),
            blocked.length > 0 ? 'valid' : 'pending',
            { supports: blocked },
          );
          structures.push(structure);
          for (const cell of blocked)
            exclusions.push({ cell, status: 'blocked', by: structure.id });
        }
        return { structures, exclusions };
      },
    },
  ];
}

/** §9.4.5 Points du trou noir. */
export function blackHolePoints(absorbedShapes: number): number {
  return absorbedShapes === 0 ? 2 : 15 + 5 * (absorbedShapes - 1);
}

/** §9.4.5 Étoile — trou noir (étape 1). */
export function starC(shape: ShapeId): Scorer[] {
  const id = `C/star[${shape}]`;
  return [
    {
      id,
      stage: 'pre-effects',
      shape,
      meta: { ...meta(1, 1, true), supportShapes: true },
      priority: 20,
      run: (ctx) => {
        const structures: StructureResult[] = [];
        const exclusions: Exclusion[] = [];
        for (const star of ctx.tokensOf(shape)) {
          const byShape = new Map<ShapeId, string[]>();
          for (const t of neighborTokens(ctx, star)) {
            if (t.shape === shape || t.camp === star.camp) continue;
            byShape.set(t.shape, [...(byShape.get(t.shape) ?? []), t.key]);
          }
          const absorbed = [...byShape.values()].filter((cells) => cells.length >= 3);
          const structure = owned(
            ctx,
            id,
            'black-hole',
            [star],
            blackHolePoints(absorbed.length),
            'valid',
            {
              supports: absorbed.flat(),
            },
          );
          structures.push(structure);
          for (const cell of absorbed.flat())
            exclusions.push({ cell, status: 'absorbed', by: structure.id });
        }
        return { structures, exclusions };
      },
    },
  ];
}

export const tierC: TierDefinition = {
  id: 'C',
  name: { fr: 'Tier C — Chaos', en: 'Tier C — Chaos' },
  byShape: {
    [SHAPE.square]: squareC,
    [SHAPE.triangle]: triangleC,
    [SHAPE.heart]: heartC,
    [SHAPE.circle]: circleC,
    [SHAPE.star]: starC,
  },
};
