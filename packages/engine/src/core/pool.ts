/**
 * Pool de jetons : réserve finie, tirages uniformes parmi les jetons présents (§4.5).
 */
import type { Rng } from './rng.ts';
import type { Pool, ShapeId } from './types.ts';

export function poolTotal(pool: Pool): number {
  let n = 0;
  for (const shape in pool) n += pool[shape]!;
  return n;
}

/** Nombre de formes représentées par au moins un jeton. */
export function poolShapeCount(pool: Pool): number {
  let n = 0;
  for (const shape in pool) if (pool[shape]! > 0) n++;
  return n;
}

export function poolAdd(pool: Pool, shape: ShapeId, amount = 1): Pool {
  return { ...pool, [shape]: (pool[shape] ?? 0) + amount };
}

export function poolRemove(pool: Pool, shape: ShapeId): Pool {
  const n = pool[shape] ?? 0;
  if (n <= 0) throw new Error(`Pool : aucun jeton ${shape} à retirer`);
  return { ...pool, [shape]: n - 1 };
}

/** Pool privée de tous les jetons d’une forme. */
export function poolWithout(pool: Pool, excluded: ShapeId): Pool {
  return { ...pool, [excluded]: 0 };
}

/**
 * Tirage uniforme d'une forme parmi les jetons présents. L'ordre de parcours est celui des
 * identifiants triés, pour rester déterministe quelle que soit la construction de la pool.
 */
export function drawFromPool(pool: Pool, rng: Rng): ShapeId | null {
  const total = poolTotal(pool);
  if (total === 0) return null;
  let idx = rng.int(total);
  for (const shape of Object.keys(pool).sort()) {
    const n = pool[shape]!;
    if (idx < n) return shape;
    idx -= n;
  }
  throw new Error('Pool : tirage incohérent');
}
