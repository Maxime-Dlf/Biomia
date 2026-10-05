/**
 * Requêtes sur le plateau, indépendantes des règles de scoring (§3, §6.3, §6.4).
 */
import { HexGrid } from './grid.ts';
import { type CellKey, cellKey, compareHex, DIRECTIONS, type Hex, rotateEdges } from './hex.ts';
import type { EnvId, PlacedTile, PlacedToken, ShapeId, TileDef } from './types.ts';

export type TileMap = ReadonlyMap<CellKey, PlacedTile>;
export type TokenMap = ReadonlyMap<CellKey, PlacedToken>;

/** Capacité d'une tuile : nombre de formes acceptées (§2). */
export function capacity(def: TileDef): number {
  return def.accepted.length;
}

/** Arêtes d'une tuile posée, après rotation (§3). */
export function placedEdges(tile: PlacedTile): EnvId[] {
  return rotateEdges(tile.def.edges, tile.rotation);
}

export function hasAdjacentTile(tiles: TileMap, q: number, r: number): boolean {
  for (const d of DIRECTIONS) {
    if (tiles.has(cellKey(q + d.q, r + d.r))) return true;
  }
  return false;
}

/** Cellules vides adjacentes à au moins une tuile, triées par `(q, r)` (§6.3). */
export function frontierCells(tiles: TileMap): Hex[] {
  const seen = new Set<CellKey>();
  const out: Hex[] = [];
  for (const t of tiles.values()) {
    for (const d of DIRECTIONS) {
      const q = t.q + d.q;
      const r = t.r + d.r;
      const k = cellKey(q, r);
      if (!tiles.has(k) && !seen.has(k)) {
        seen.add(k);
        out.push({ q, r });
      }
    }
  }
  return out.sort(compareHex);
}

/** Une tuile peut-elle recevoir ce jeton : sans jeton et forme acceptée (§6.5) ? */
export function canHostToken(
  tiles: TileMap,
  tokens: TokenMap,
  key: CellKey,
  shape: ShapeId,
): boolean {
  const tile = tiles.get(key);
  return tile !== undefined && !tokens.has(key) && tile.def.accepted.includes(shape);
}

/** Cellules pouvant recevoir un jeton de cette forme, n'importe où sur le plateau (§6.4). */
export function tokenTargets(tiles: TileMap, tokens: TokenMap, shape: ShapeId): Hex[] {
  const out: Hex[] = [];
  for (const [key, tile] of tiles) {
    if (!tokens.has(key) && tile.def.accepted.includes(shape)) out.push({ q: tile.q, r: tile.r });
  }
  return out.sort(compareHex);
}

/** Jeton plaçable : il existe au moins une tuile sans jeton qui accepte sa forme (§6.4). */
export function isTokenPlaceable(tiles: TileMap, tokens: TokenMap, shape: ShapeId): boolean {
  for (const [key, tile] of tiles) {
    if (!tokens.has(key) && tile.def.accepted.includes(shape)) return true;
  }
  return false;
}

/**
 * Cellules extérieures (§3) : diffusion depuis l'anneau qui entoure la boîte englobante agrandie.
 * Les trous fermés (« lacs ») ne sont pas extérieurs. Retourne un prédicat sur `(q, r)`.
 */
export function exteriorTest(tiles: TileMap): (q: number, r: number) => boolean {
  if (tiles.size === 0) return () => true;
  const grid = new HexGrid(tiles.values());
  const minQ = grid.minQ - 1;
  const minR = grid.minR - 1;
  const width = grid.maxQ - grid.minQ + 3;
  const height = grid.maxR - grid.minR + 3;
  const outside = new Uint8Array(width * height);
  const stack: number[] = [0];
  outside[0] = 1;
  while (stack.length > 0) {
    const idx = stack.pop()!;
    const q = Math.floor(idx / height) + minQ;
    const r = (idx % height) + minR;
    for (const d of DIRECTIONS) {
      const nq = q + d.q;
      const nr = r + d.r;
      const iq = nq - minQ;
      const ir = nr - minR;
      if (iq < 0 || iq >= width || ir < 0 || ir >= height) continue;
      const n = iq * height + ir;
      if (outside[n] || grid.has(nq, nr)) continue;
      outside[n] = 1;
      stack.push(n);
    }
  }
  return (q, r) => {
    const iq = q - minQ;
    const ir = r - minR;
    // Hors de la boîte agrandie : toujours extérieur.
    if (iq < 0 || iq >= width || ir < 0 || ir >= height) return true;
    return outside[iq * height + ir] === 1;
  };
}

/** Cellules extérieures de la boîte englobante agrandie d'un anneau (§3). */
export function exteriorCells(tiles: TileMap): Set<CellKey> {
  const out = new Set<CellKey>();
  if (tiles.size === 0) return out;
  const isOutside = exteriorTest(tiles);
  const grid = new HexGrid(tiles.values());
  for (let q = grid.minQ - 1; q <= grid.maxQ + 1; q++) {
    for (let r = grid.minR - 1; r <= grid.maxR + 1; r++)
      if (isOutside(q, r)) out.add(cellKey(q, r));
  }
  return out;
}

/** Tuiles en bordure : au moins une voisine extérieure (§3). */
export function borderTiles(tiles: TileMap): Set<CellKey> {
  const out = new Set<CellKey>();
  const isOutside = exteriorTest(tiles);
  for (const [key, t] of tiles) {
    for (const d of DIRECTIONS) {
      if (isOutside(t.q + d.q, t.r + d.r)) {
        out.add(key);
        break;
      }
    }
  }
  return out;
}
