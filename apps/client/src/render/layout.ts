/**
 * Géométrie à l'écran (§3) : hexagones pointe en haut, coordonnées axiales ↔ pixels.
 */
import type { Hex } from '@crassecadia/engine';

/** Rayon d'un hexagone (centre → coin) en unités du monde. */
export const HEX_SIZE = 48;
const SQRT3 = Math.sqrt(3);

export function hexToPixel(q: number, r: number, size = HEX_SIZE): { x: number; y: number } {
  return { x: size * SQRT3 * (q + r / 2), y: size * 1.5 * r };
}

/** Cellule contenant le point (arrondi cubique). */
export function pixelToHex(x: number, y: number, size = HEX_SIZE): Hex {
  const qf = ((SQRT3 / 3) * x - y / 3) / size;
  const rf = ((2 / 3) * y) / size;
  const sf = -qf - rf;
  let q = Math.round(qf);
  let r = Math.round(rf);
  const s = Math.round(sf);
  const dq = Math.abs(q - qf);
  const dr = Math.abs(r - rf);
  const ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return { q: q === 0 ? 0 : q, r: r === 0 ? 0 : r };
}

/**
 * Coins d'un hexagone. La direction `i` pointe à 60°·i dans le sens antihoraire à l'écran (§3) ;
 * l'arête `i` relie les coins `i` (à 60°·i − 30°) et `i + 1` de ce tableau.
 */
export function hexCorners(cx: number, cy: number, size = HEX_SIZE): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = ((60 * i - 30) * Math.PI) / 180;
    out.push({ x: cx + size * Math.cos(angle), y: cy - size * Math.sin(angle) });
  }
  return out;
}

/** Coins de l'arête `i` : `[début, fin]`. */
export function edgeCorners(corners: readonly { x: number; y: number }[], i: number) {
  return [corners[i]!, corners[(i + 1) % 6]!] as const;
}
