/**
 * Tier D — Expert / Master, référence v1 (§9.1).
 */
import {
  assignLines,
  type CellKey,
  connectedComponents,
  distributeByCount,
  type ScoredToken,
  type Scorer,
  type ShapeId,
  type StructureResult,
  tableValue,
} from '@crassecadia/engine';
import { SHAPE } from '../ids.ts';
import type { TierDefinition } from '../mod.ts';
import {
  gridOf,
  invalidatedGroups,
  meta,
  neighborsIn,
  neighborTokens,
  owned,
  trianglesAround,
} from './shared.ts';

/** §9.1.1 Barème par nombre de paires : 5, 11, 18, 27, puis +9 par paire. */
export function squarePairsTotal(n: number): number {
  const table = [0, 5, 11, 18, 27];
  return n < table.length ? table[n]! : 27 + 9 * (n - 4);
}

/** §9.1.1 Carré — paires strictes isolées. */
export function squareD(shape: ShapeId): Scorer[] {
  const id = `D/square[${shape}]`;
  return [
    {
      id,
      stage: 'structures',
      shape,
      meta: meta(2, 2, true),
      priority: 0,
      run: (ctx) => {
        const structures: StructureResult[] = [];
        const pairs: StructureResult[] = [];
        for (const comp of ctx.components(shape)) {
          if (comp.length === 1) structures.push(owned(ctx, id, 'single', comp, 0, 'pending'));
          else if (comp.length === 2) pairs.push(owned(ctx, id, 'pair', comp, 0, 'valid'));
          else structures.push(owned(ctx, id, 'invalidated', comp, 0, 'invalidated'));
        }
        const points = distributeByCount(pairs, squarePairsTotal);
        return {
          structures: [...structures, ...pairs.map((p) => ({ ...p, points: points.get(p) ?? 0 }))],
        };
      },
    },
  ];
}

/** §9.1.2 Barème par chaîne de triangles. */
export const TRIANGLE_D_TABLE = [0, 2, 5, 9, 13, 17, 21, 25];

/** §9.1.2 Triangle — ligne droite stricte. */
export function triangleD(shape: ShapeId): Scorer[] {
  const id = `D/triangle[${shape}]`;
  return [
    {
      id,
      stage: 'structures',
      shape,
      meta: meta(1, null, false),
      priority: 0,
      run: (ctx) => ({
        structures: assignLines(ctx.tokensOf(shape)).map((run) =>
          owned(
            ctx,
            id,
            'line',
            run.members,
            tableValue(TRIANGLE_D_TABLE, run.members.length),
            'valid',
            {
              data: { axis: run.family ?? -1 },
            },
          ),
        ),
      }),
    },
  ];
}

/** §9.1.3 Barème par segment de cœurs (repris par le §9.4.3). */
export const HEART_CHAIN_TABLE = [0, 2, 4, 7, 12, 16, 20, 25];

/** Cœurs appartenant à au moins un triangle de 3 cœurs mutuellement adjacents (§9.1.3). */
export function heartsInTriangles(hearts: readonly ScoredToken[]): Set<CellKey> {
  const grid = gridOf(hearts);
  const out = new Set<CellKey>();
  for (const h of hearts) {
    for (const [a, b] of trianglesAround(h)) {
      const ta = grid.get(a.q, a.r);
      const tb = grid.get(b.q, b.r);
      if (ta && tb) {
        out.add(h.key);
        out.add(ta.key);
        out.add(tb.key);
      }
    }
  }
  return out;
}

/** §9.1.3 Cœur — chaînes et boucles sans triangle direct. */
export function heartD(shape: ShapeId): Scorer[] {
  const id = `D/heart[${shape}]`;
  return [
    {
      id,
      stage: 'structures',
      shape,
      meta: meta(1, null, true),
      priority: 0,
      run: (ctx) => {
        const hearts = ctx.tokensOf(shape);
        const invalid = heartsInTriangles(hearts);
        const remaining = hearts.filter((h) => !invalid.has(h.key));
        return {
          structures: [
            ...invalidatedGroups(
              ctx,
              id,
              hearts.filter((h) => invalid.has(h.key)),
            ),
            ...connectedComponents(remaining).map((seg) =>
              owned(ctx, id, 'segment', seg, tableValue(HEART_CHAIN_TABLE, seg.length), 'valid'),
            ),
          ],
        };
      },
    },
  ];
}

/** §9.1.4 Barème par nombre de ronds isolés. */
export const CIRCLE_D_TABLE = [0, 2, 5, 8, 11, 14, 18, 22, 26];

/** §9.1.4 Rond — solitaires isolés. */
export function circleD(shape: ShapeId): Scorer[] {
  const id = `D/circle[${shape}]`;
  return [
    {
      id,
      stage: 'structures',
      shape,
      meta: meta(1, 1, true),
      priority: 0,
      run: (ctx) => {
        const circles = ctx.tokensOf(shape);
        const grid = gridOf(circles);
        const isolated: StructureResult[] = [];
        const touching: ScoredToken[] = [];
        for (const c of circles) {
          if (neighborsIn(c, grid).length === 0)
            isolated.push(owned(ctx, id, 'isolated', [c], 0, 'valid'));
          else touching.push(c);
        }
        const points = distributeByCount(isolated, (n) => tableValue(CIRCLE_D_TABLE, n));
        return {
          structures: [
            ...invalidatedGroups(ctx, id, touching),
            ...isolated.map((s) => ({ ...s, points: points.get(s) ?? 0 })),
          ],
        };
      },
    },
  ];
}

/** §9.1.5 Points d'une étoile : d × (d + 3) / 2. */
export function starDPoints(d: number): number {
  return (d * (d + 3)) / 2;
}

/** §9.1.5 Étoile — diversité multiforme. */
export function starD(shape: ShapeId): Scorer[] {
  const id = `D/star[${shape}]`;
  return [
    {
      id,
      stage: 'structures',
      shape,
      meta: { ...meta(1, 1, false), supportShapes: true },
      priority: 0,
      run: (ctx) => ({
        structures: ctx.tokensOf(shape).map((star) => {
          // Étoiles voisines et jetons invalidés comptent ; doublons une seule fois.
          const neighbors = neighborTokens(ctx, star);
          const supports = neighbors.map((t) => t.key);
          const d = new Set(neighbors.map((t) => t.shape)).size;
          const points = starDPoints(d);
          return owned(ctx, id, 'star', [star], points, points > 0 ? 'valid' : 'pending', {
            supports,
          });
        }),
      }),
    },
  ];
}

export const tierD: TierDefinition = {
  id: 'D',
  name: { fr: 'Tier D — Expert', en: 'Tier D — Expert' },
  byShape: {
    [SHAPE.square]: squareD,
    [SHAPE.triangle]: triangleD,
    [SHAPE.heart]: heartD,
    [SHAPE.circle]: circleD,
    [SHAPE.star]: starD,
  },
};
