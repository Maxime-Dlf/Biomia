/**
 * Tier A — Initiation et dynamisme (§9.2) [PLAYTEST].
 */
import {
  assignChronological,
  connectedComponents,
  DIRECTIONS,
  distance,
  type Hex,
  type ScoredToken,
  type Scorer,
  type ShapeId,
  tableValue,
} from '@crassecadia/engine';
import { SHAPE } from '../ids.ts';
import type { TierDefinition } from '../mod.ts';
import {
  gridOf,
  invalidatedGroups,
  meta,
  neighborsIn,
  neighborTiles,
  owned,
  pendingSingles,
  trianglesAround,
} from './shared.ts';

/** §9.2.1 Carré — trios compacts (algorithme « chronologique »), 9 points par trio. */
export function squareA(shape: ShapeId): Scorer[] {
  const id = `A/square[${shape}]`;
  return [
    {
      id,
      stage: 'structures',
      shape,
      meta: meta(3, 3, false),
      priority: 0,
      run: (ctx) => {
        const squares = ctx.tokensOf(shape);
        const grid = gridOf(squares);
        const { motifs, leftovers } = assignChronological(squares, (t) =>
          trianglesAround(t).flatMap(([a, b]) => {
            const ta = grid.get(a.q, a.r);
            const tb = grid.get(b.q, b.r);
            return ta && tb ? [[ta, tb]] : [];
          }),
        );
        return {
          structures: [
            ...motifs.map((m) => owned(ctx, id, 'trio', m.members, 9, 'valid')),
            // Carrés en trop : neutres, sans fracture, pas d'invalidation.
            ...pendingSingles(ctx, id, leftovers),
          ],
        };
      },
    },
  ];
}

/** §9.2.2 Barème par chaîne de bordure. */
export const TRIANGLE_A_TABLE = [0, 0, 4, 8, 13, 18, 24];

/** §9.2.2 Triangle — chaînes de bordure. */
export function triangleA(shape: ShapeId): Scorer[] {
  const id = `A/triangle[${shape}]`;
  return [
    {
      id,
      stage: 'structures',
      shape,
      meta: meta(2, null, true),
      priority: 0,
      run: (ctx) => {
        const triangles = ctx.tokensOf(shape);
        const border = triangles.filter((t) => ctx.isBorder(t.key));
        const inner = triangles.filter((t) => !ctx.isBorder(t.key));
        return {
          structures: [
            ...invalidatedGroups(ctx, id, inner),
            ...connectedComponents(border).map((chain) =>
              owned(
                ctx,
                id,
                'chain',
                chain,
                tableValue(TRIANGLE_A_TABLE, chain.length),
                chain.length >= 2 ? 'valid' : 'pending',
              ),
            ),
          ],
        };
      },
    },
  ];
}

/** Les 12 décalages à distance exactement 2 (§3). */
const RING_2: readonly { q: number; r: number }[] = (() => {
  const out: { q: number; r: number }[] = [];
  for (let q = -2; q <= 2; q++) {
    for (let r = -2; r <= 2; r++) if (distance({ q: 0, r: 0 }, { q, r }) === 2) out.push({ q, r });
  }
  return out;
})();

/** Cellules voisines communes à deux cellules. */
function commonNeighbors(a: Hex, b: Hex): Hex[] {
  return DIRECTIONS.map((d) => ({ q: a.q + d.q, r: a.r + d.r })).filter(
    (c) => distance(c, b) === 1,
  );
}

/** §9.2.3 Cœur — paires espacées, 6 points par paire. */
export function heartA(shape: ShapeId): Scorer[] {
  const id = `A/heart[${shape}]`;
  return [
    {
      id,
      stage: 'structures',
      shape,
      meta: meta(2, 2, true),
      priority: 0,
      run: (ctx) => {
        const hearts = ctx.tokensOf(shape);
        const grid = gridOf(hearts);
        const invalid = hearts.filter((h) => neighborsIn(h, grid).length > 0);
        const invalidKeys = new Set(invalid.map((h) => h.key));
        const valid = hearts.filter((h) => !invalidKeys.has(h.key));
        // Motif : deux cœurs à distance exactement 2, avec une voisine commune occupée par une tuile.
        const validGrid = gridOf(valid);
        const { motifs, leftovers } = assignChronological(valid, (t, isFree) =>
          RING_2.map((o) => validGrid.get(t.q + o.q, t.r + o.r))
            .filter(
              (o): o is ScoredToken =>
                o !== undefined &&
                isFree(o.key) &&
                commonNeighbors(t, o).some((c) => ctx.tileAt(c.q, c.r) !== undefined),
            )
            .map((o) => [o]),
        );
        return {
          structures: [
            ...invalidatedGroups(ctx, id, invalid),
            ...motifs.map((m) => owned(ctx, id, 'pair', m.members, 6, 'valid')),
            ...pendingSingles(ctx, id, leftovers),
          ],
        };
      },
    },
  ];
}

/** §9.2.4 Barème par clan (1 ou 2 → en attente ; 6 et plus → détruit). */
export const CIRCLE_A_TABLE = [0, 0, 0, 6, 11, 17];

/** §9.2.4 Rond — clans libres. */
export function circleA(shape: ShapeId): Scorer[] {
  const id = `A/circle[${shape}]`;
  return [
    {
      id,
      stage: 'structures',
      shape,
      meta: meta(3, 5, true),
      priority: 0,
      run: (ctx) => ({
        structures: ctx.components(shape).map((clan) => {
          if (clan.length >= 6) return owned(ctx, id, 'destroyed', clan, 0, 'invalidated');
          const points = CIRCLE_A_TABLE[clan.length]!;
          return owned(ctx, id, 'clan', clan, points, points > 0 ? 'valid' : 'pending');
        }),
      }),
    },
  ];
}

/** §9.2.5 Étoile — balises de biomes : 3 points par couleur distincte des tuiles voisines. */
export function starA(shape: ShapeId): Scorer[] {
  const id = `A/star[${shape}]`;
  return [
    {
      id,
      stage: 'structures',
      shape,
      meta: { ...meta(1, 1, false), supportShapes: true },
      priority: 0,
      run: (ctx) => ({
        structures: ctx.tokensOf(shape).map((star) => {
          const tiles = neighborTiles(ctx, star);
          const colors = new Set<string>();
          for (const tile of tiles) for (const e of tile.edges) colors.add(e);
          const points = 3 * colors.size;
          return owned(ctx, id, 'beacon', [star], points, points > 0 ? 'valid' : 'pending', {
            supports: tiles.map((t) => t.key),
          });
        }),
      }),
    },
  ];
}

export const tierA: TierDefinition = {
  id: 'A',
  name: { fr: 'Tier A — Initiation', en: 'Tier A — Initiation' },
  byShape: {
    [SHAPE.square]: squareA,
    [SHAPE.triangle]: triangleA,
    [SHAPE.heart]: heartA,
    [SHAPE.circle]: circleA,
    [SHAPE.star]: starA,
  },
};
