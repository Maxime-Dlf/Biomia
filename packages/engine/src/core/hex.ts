/**
 * Géométrie du plateau (§3) : coordonnées axiales `(q, r)`, orientation pointy-top.
 * La coordonnée cube implicite est `s = −q − r`.
 */

export interface Hex {
  readonly q: number;
  readonly r: number;
}

/** Clé de cellule `"q,r"`, utilisée pour indexer les tuiles et les jetons. */
export type CellKey = string;

export type Direction = 0 | 1 | 2 | 3 | 4 | 5;
export type Rotation = 0 | 1 | 2 | 3 | 4 | 5;

/** Directions indexées dans le sens antihoraire à l'écran : E, NE, NO, O, SO, SE (§3). */
export const DIRECTIONS: readonly Hex[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export const ALL_DIRECTIONS: readonly Direction[] = [0, 1, 2, 3, 4, 5];

export function cellKey(q: number, r: number): CellKey {
  return `${q},${r}`;
}

export function hexKey(h: Hex): CellKey {
  return cellKey(h.q, h.r);
}

export function parseKey(key: CellKey): Hex {
  const comma = key.indexOf(',');
  return { q: Number(key.slice(0, comma)), r: Number(key.slice(comma + 1)) };
}

export function mod6(n: number): Direction {
  return (((n % 6) + 6) % 6) as Direction;
}

/** L'arête `i` d'une tuile touche l'arête `(i + 3) mod 6` de son voisin dans la direction `i`. */
export function opposite(dir: number): Direction {
  return mod6(dir + 3);
}

export function neighbor(h: Hex, dir: number): Hex {
  const d = DIRECTIONS[mod6(dir)]!;
  return { q: h.q + d.q, r: h.r + d.r };
}

export function neighbors(h: Hex): Hex[] {
  return DIRECTIONS.map((d) => ({ q: h.q + d.q, r: h.r + d.r }));
}

export function neighborKeys(q: number, r: number): CellKey[] {
  return DIRECTIONS.map((d) => cellKey(q + d.q, r + d.r));
}

/** Distance hexagonale `(|Δq| + |Δr| + |Δs|) / 2` (§3). */
export function distance(a: Hex, b: Hex): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

export function areAdjacent(a: Hex, b: Hex): boolean {
  return distance(a, b) === 1;
}

/** Direction de `a` vers `b` s'ils sont adjacents, sinon `null`. */
export function directionTo(a: Hex, b: Hex): Direction | null {
  const dq = b.q - a.q;
  const dr = b.r - a.r;
  const i = DIRECTIONS.findIndex((d) => d.q === dq && d.r === dr);
  return i < 0 ? null : (i as Direction);
}

/**
 * Rotation d'un vecteur de 60° pour les tuiles de départ (§3) : `(q, r, s) → (−r, −s, −q)`.
 * À l'écran, elle fait passer la direction `d` à la direction `d − 1` (sens horaire).
 */
export function rotateVector(h: Hex, steps = 1): Hex {
  let q = h.q;
  let r = h.r;
  for (let i = 0; i < mod6(steps); i++) {
    const s = -q - r;
    const nq = -r;
    const nr = -s;
    q = nq;
    r = nr;
  }
  return { q: q === 0 ? 0 : q, r: r === 0 ? 0 : r };
}

/** Arêtes posées après rotation `k` : `arêtes_posées[i] = arêtes_def[(i − k) mod 6]` (§3). */
export function rotateEdges<T>(edges: readonly T[], rotation: number): T[] {
  const k = mod6(rotation);
  const out = new Array<T>(6);
  for (let i = 0; i < 6; i++) out[i] = edges[(i - k + 6) % 6]!;
  return out;
}

/** Compare deux cellules par `(q, r)` croissants (départage de l'ancienneté, §7.2). */
export function compareHex(a: Hex, b: Hex): number {
  return a.q - b.q || a.r - b.r;
}
