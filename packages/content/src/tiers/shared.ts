/**
 * Utilitaires communs aux scorers des tiers officiels. Les recherches de voisinage passent par des
 * grilles `(q, r)` plutôt que par des clés textuelles (budgets du §20.2).
 */
import {
  connectedComponents,
  DIRECTIONS,
  type Hex,
  HexGrid,
  type ScoredTile,
  type ScoredToken,
  type ScorerMeta,
  type ScoringContext,
  type StructureResult,
  type StructureStatus,
  tokenStructure,
} from '@crassecadia/engine';

export const meta = (
  minSize: number,
  maxSize: number | null,
  canInvalidate: boolean,
): ScorerMeta => ({ minSize, maxSize, canInvalidate, sizeUnit: 'tokens' });

/** Grille des jetons donnés. */
export function gridOf(tokens: readonly ScoredToken[]): HexGrid<ScoredToken> {
  return new HexGrid(tokens);
}

/** Voisins d'une cellule présents dans la grille (et, si fourni, encore libres). */
export function neighborsIn(
  t: Hex,
  grid: HexGrid<ScoredToken>,
  isFree?: (t: ScoredToken) => boolean,
): ScoredToken[] {
  const out: ScoredToken[] = [];
  for (const d of DIRECTIONS) {
    const n = grid.get(t.q + d.q, t.r + d.r);
    if (n && (!isFree || isFree(n))) out.push(n);
  }
  return out;
}

/** Tuiles posées sur les 6 cellules voisines. */
export function neighborTiles(ctx: ScoringContext, t: Hex): ScoredTile[] {
  const out: ScoredTile[] = [];
  for (const d of DIRECTIONS) {
    const n = ctx.tileAt(t.q + d.q, t.r + d.r);
    if (n) out.push(n);
  }
  return out;
}

/** Jetons actifs sur les 6 cellules voisines. */
export function neighborTokens(ctx: ScoringContext, t: Hex): ScoredToken[] {
  const out: ScoredToken[] = [];
  for (const d of DIRECTIONS) {
    const n = ctx.tokenAt(t.q + d.q, t.r + d.r);
    if (n) out.push(n);
  }
  return out;
}

/** Structure dont le propriétaire suit la règle générale (§7.1) via le contexte. */
export function owned(
  ctx: ScoringContext,
  scorer: string,
  kind: string,
  members: readonly ScoredToken[],
  points: number,
  status: StructureStatus,
  extra: Partial<Pick<StructureResult, 'supports' | 'data'>> = {},
): StructureResult {
  return tokenStructure(scorer, kind, members, {
    owner: ctx.ownerOfTokens(members, scorer),
    points,
    status,
    ...extra,
  });
}

/** Composantes invalidées : un groupe par composante connexe des jetons donnés. */
export function invalidatedGroups(
  ctx: ScoringContext,
  scorer: string,
  tokens: readonly ScoredToken[],
): StructureResult[] {
  return connectedComponents(tokens).map((comp) =>
    owned(ctx, scorer, 'invalidated', comp, 0, 'invalidated'),
  );
}

/** Jetons restants « en attente » (neutres, sans fracture), un par structure. */
export function pendingSingles(
  ctx: ScoringContext,
  scorer: string,
  tokens: readonly ScoredToken[],
): StructureResult[] {
  return tokens.map((t) => owned(ctx, scorer, 'free', [t], 0, 'pending'));
}

/** Les paires de cellules qui forment un triangle (3 cellules mutuellement adjacentes) avec `t`. */
export function trianglesAround(t: Hex): [Hex, Hex][] {
  const out: [Hex, Hex][] = [];
  for (let d = 0; d < 6; d++) {
    const a = DIRECTIONS[d]!;
    const b = DIRECTIONS[(d + 1) % 6]!;
    out.push([
      { q: t.q + a.q, r: t.r + a.r },
      { q: t.q + b.q, r: t.r + b.r },
    ]);
  }
  return out;
}
