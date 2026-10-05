/**
 * Tier B — Densité et alignements (§9.3) [PLAYTEST].
 */
import {
  assignChronological,
  assignRuns,
  BinaryHeap,
  type CellKey,
  cellKey,
  compareHex,
  DIRECTIONS,
  type Run,
  type ScoredToken,
  type Scorer,
  type ShapeId,
  type StructureResult,
  seniorityOf,
  tableValue,
} from '@crassecadia/engine';
import { SHAPE } from '../ids.ts';
import type { TierDefinition } from '../mod.ts';
import { gridOf, meta, neighborsIn, neighborTiles, owned, pendingSingles } from './shared.ts';

const dir = (d: number) => DIRECTIONS[((d % 6) + 6) % 6]!;

/**
 * Losanges contenant l'origine, en décalages relatifs : deux triangles qui partagent l'arête
 * `(a, a + D(k))`, soit `{a, a + D(k), a + D(k + 1), a + D(k − 1)}` (§9.3.1). Calculés une fois.
 */
const RHOMBUS_OFFSETS: readonly (readonly { q: number; r: number }[])[] = (() => {
  const anchors = [{ q: 0, r: 0 }, ...DIRECTIONS];
  const seen = new Set<string>();
  const out: { q: number; r: number }[][] = [];
  for (const a of anchors) {
    for (let k = 0; k < 6; k++) {
      const cells = [
        a,
        ...[k, k + 1, k - 1].map((d) => ({ q: a.q + dir(d).q, r: a.r + dir(d).r })),
      ];
      if (!cells.some((c) => c.q === 0 && c.r === 0)) continue;
      const id = cells
        .map((c) => `${c.q},${c.r}`)
        .sort()
        .join('|');
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(cells);
    }
  }
  return out;
})();

/** Losanges contenant la cellule `t` (§9.3.1). */
export function rhombiAround(t: { q: number; r: number }): CellKey[][] {
  return RHOMBUS_OFFSETS.map((cells) => cells.map((c) => cellKey(t.q + c.q, t.r + c.r)));
}

/** §9.3.1 Carré — losanges (algorithme « chronologique »), 14 points par losange. */
export function squareB(shape: ShapeId): Scorer[] {
  const id = `B/square[${shape}]`;
  return [
    {
      id,
      stage: 'structures',
      shape,
      meta: meta(4, 4, false),
      priority: 0,
      run: (ctx) => {
        const squares = ctx.tokensOf(shape);
        const grid = gridOf(squares);
        const { motifs, leftovers } = assignChronological(squares, (t) =>
          RHOMBUS_OFFSETS.flatMap((cells) => {
            const others: ScoredToken[] = [];
            for (const c of cells) {
              if (c.q === 0 && c.r === 0) continue;
              const o = grid.get(t.q + c.q, t.r + c.r);
              if (!o) return [];
              others.push(o);
            }
            return [others];
          }),
        );
        return {
          structures: [
            ...motifs.map((m) => owned(ctx, id, 'rhombus', m.members, 14, 'valid')),
            ...pendingSingles(ctx, id, leftovers),
          ],
        };
      },
    },
  ];
}

/** Familles de chevrons : directions voisines `{d, d + 1}` (§9.3.2). */
const CHEVRON_FAMILIES: readonly [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
];

/**
 * Séries maximales alternées (§9.3.2), pour chaque famille et chaque phase de départ :
 * `x(i + 1) = x(i) + D(pas[i mod 2])`.
 */
export function chevronCandidates(tokens: readonly ScoredToken[]): Run[] {
  const grid = gridOf(tokens);
  const out: Run[] = [];
  CHEVRON_FAMILIES.forEach(([a, b], family) => {
    for (const steps of [
      [a, b],
      [b, a],
    ] as const) {
      for (const t of tokens) {
        // Début de série : aucun jeton à la position précédente (pas précédent = steps[1]).
        const back = dir(steps[1] + 3);
        if (grid.has(t.q + back.q, t.r + back.r)) continue;
        const members: ScoredToken[] = [t];
        let cur: ScoredToken | undefined = t;
        for (let i = 0; cur; i++) {
          const step = dir(steps[i % 2]!);
          cur = grid.get(cur.q + step.q, cur.r + step.r);
          if (cur) members.push(cur);
        }
        if (members.length >= 3) out.push({ members, family });
      }
    }
  });
  return out;
}

/** §9.3.2 Barème par chevron (moins de 3 : neutre). */
export const TRIANGLE_B_TABLE = [0, 0, 0, 6, 10, 15, 21];

/** §9.3.2 Triangle — chevrons. */
export function triangleB(shape: ShapeId): Scorer[] {
  const id = `B/triangle[${shape}]`;
  return [
    {
      id,
      stage: 'structures',
      shape,
      meta: meta(3, null, false),
      priority: 0,
      run: (ctx) => {
        const triangles = ctx.tokensOf(shape);
        return {
          structures: assignRuns(triangles, chevronCandidates(triangles), 3).map((run) =>
            run.members.length >= 3
              ? owned(
                  ctx,
                  id,
                  'chevron',
                  run.members,
                  tableValue(TRIANGLE_B_TABLE, run.members.length),
                  'valid',
                  {
                    data: { family: run.family ?? -1 },
                  },
                )
              : owned(ctx, id, 'free', run.members, 0, 'pending'),
          ),
        };
      },
    },
  ];
}

/** §9.3.3 Cœur — arbres ramifiés : 12 points par cœur ayant au moins 3 cœurs voisins. */
export function heartB(shape: ShapeId): Scorer[] {
  const id = `B/heart[${shape}]`;
  return [
    {
      id,
      stage: 'structures',
      shape,
      meta: meta(4, null, true),
      priority: 0,
      run: (ctx) => ({
        structures: ctx.components(shape).map((comp) => {
          const grid = gridOf(comp);
          const degrees = comp.map((h) => neighborsIn(h, grid).length);
          const edges = degrees.reduce((x, y) => x + y, 0) / 2;
          // Un cycle existe dès que le nombre d'arêtes atteint le nombre de nœuds.
          if (edges >= comp.length) return owned(ctx, id, 'cycle', comp, 0, 'invalidated');
          const points = 12 * degrees.filter((d) => d >= 3).length;
          return owned(ctx, id, 'tree', comp, points, points > 0 ? 'valid' : 'pending');
        }),
      }),
    },
  ];
}

/** §9.3.4 Barème par couronne. */
export const CIRCLE_B_TABLE = [0, 0, 0, 0, 8, 14, 22];

/** §9.3.4 Rond — couronnes, attribution gloutonne autour des centres. */
export function circleB(shape: ShapeId): Scorer[] {
  const id = `B/circle[${shape}]`;
  return [
    {
      id,
      stage: 'structures',
      shape,
      meta: meta(4, 6, false),
      priority: 0,
      run: (ctx) => {
        const circles = ctx.tokensOf(shape);
        const grid = gridOf(circles);
        const free = new Set<ScoredToken>(circles);
        const isFree = (t: ScoredToken) => free.has(t);
        // Centres : tuiles dont le jeton n'est pas un rond (ou sans jeton), voisines d'un rond.
        const centers = new Map<CellKey, { q: number; r: number }>();
        for (const c of circles) {
          for (const tile of neighborTiles(ctx, c)) {
            if (ctx.tokenAt(tile.q, tile.r)?.shape !== shape) centers.set(tile.key, tile);
          }
        }
        // Attribution gloutonne : k décroissant, puis ancienneté, puis coordonnées. Le k d'un centre ne
        // peut que baisser quand des ronds sont pris : tas à invalidation paresseuse.
        type Candidate = {
          center: CellKey;
          pos: { q: number; r: number };
          members: ScoredToken[];
          seniority: number;
        };
        const candidate = (center: CellKey, pos: { q: number; r: number }): Candidate => {
          const members = neighborsIn(pos, grid, isFree);
          return { center, pos, members, seniority: seniorityOf(members) };
        };
        const heap = new BinaryHeap<Candidate>(
          (a, b) =>
            b.members.length - a.members.length ||
            a.seniority - b.seniority ||
            compareHex(a.pos, b.pos),
        );
        for (const [key, pos] of centers) {
          const c = candidate(key, pos);
          if (c.members.length >= 4) heap.push(c);
        }
        const crowns: StructureResult[] = [];
        while (heap.size > 0) {
          const best = heap.pop()!;
          if (best.members.some((m) => !free.has(m))) {
            const fresh = candidate(best.center, best.pos);
            if (fresh.members.length >= 4) heap.push(fresh);
            continue;
          }
          crowns.push(
            owned(
              ctx,
              id,
              'crown',
              best.members,
              tableValue(CIRCLE_B_TABLE, best.members.length),
              'valid',
              {
                supports: [best.center],
              },
            ),
          );
          for (const m of best.members) free.delete(m);
        }
        return { structures: [...crowns, ...pendingSingles(ctx, id, [...free.values()])] };
      },
    },
  ];
}

/** §9.3.5 Points du pont stellaire : p < 2 → 0 ; 8, 13, 19, 26, puis +1 par palier sur l'écart. */
export function starBPoints(p: number): number {
  if (p < 2) return 0;
  let points = 8;
  for (let k = 3; k <= p; k++) points += k + 2;
  return points;
}

/** §9.3.5 Étoile — pont stellaire. */
export function starB(shape: ShapeId): Scorer[] {
  const id = `B/star[${shape}]`;
  return [
    {
      id,
      stage: 'structures',
      shape,
      meta: meta(1, 1, false),
      priority: 0,
      run: (ctx) => {
        const validColors = new Map<CellKey, Set<string>>();
        for (const env of ctx.environments) {
          if (!env.valid) continue;
          for (const k of env.tiles) {
            const set = validColors.get(k) ?? new Set<string>();
            set.add(env.env);
            validColors.set(k, set);
          }
        }
        return {
          structures: ctx.tokensOf(shape).map((star) => {
            const colors = new Set<string>();
            for (const k of [star.key, ...neighborTiles(ctx, star).map((t) => t.key)]) {
              for (const c of validColors.get(k) ?? []) colors.add(c);
            }
            const points = starBPoints(colors.size);
            return owned(ctx, id, 'bridge', [star], points, points > 0 ? 'valid' : 'pending');
          }),
        };
      },
    },
  ];
}

export const tierB: TierDefinition = {
  id: 'B',
  name: { fr: 'Tier B — Densité', en: 'Tier B — Density' },
  byShape: {
    [SHAPE.square]: squareB,
    [SHAPE.triangle]: triangleB,
    [SHAPE.heart]: heartB,
    [SHAPE.circle]: circleB,
    [SHAPE.star]: starB,
  },
};
