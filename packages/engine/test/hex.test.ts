import { describe, expect, it } from 'vitest';
import {
  borderTiles,
  cellKey,
  DIRECTIONS,
  directionTo,
  distance,
  exteriorCells,
  neighbor,
  opposite,
  type PlacedTile,
  parseKey,
  rotateEdges,
  rotateVector,
} from '../src/index.ts';

describe('§3 Géométrie du plateau', () => {
  it('directions 0..5 dans le sens antihoraire : E, NE, NO, O, SO, SE', () => {
    expect(DIRECTIONS).toEqual([
      { q: 1, r: 0 },
      { q: 1, r: -1 },
      { q: 0, r: -1 },
      { q: -1, r: 0 },
      { q: -1, r: 1 },
      { q: 0, r: 1 },
    ]);
  });

  it("l'arête i touche l'arête (i + 3) mod 6 du voisin", () => {
    for (let i = 0; i < 6; i++) {
      const n = neighbor({ q: 0, r: 0 }, i);
      expect(directionTo(n, { q: 0, r: 0 })).toBe(opposite(i));
    }
  });

  it('distance = (|Δq| + |Δr| + |Δs|) / 2', () => {
    expect(distance({ q: 0, r: 0 }, { q: 2, r: -1 })).toBe(2);
    expect(distance({ q: -3, r: 1 }, { q: 2, r: -2 })).toBe(5);
    for (const d of DIRECTIONS) expect(distance({ q: 0, r: 0 }, d)).toBe(1);
  });

  it('rotation k : arêtes_posées[i] = arêtes_def[(i − k) mod 6]', () => {
    const def = ['a', 'b', 'c', 'd', 'e', 'f'];
    expect(rotateEdges(def, 0)).toEqual(def);
    expect(rotateEdges(def, 1)).toEqual(['f', 'a', 'b', 'c', 'd', 'e']);
    expect(rotateEdges(def, 5)).toEqual(['b', 'c', 'd', 'e', 'f', 'a']);
  });

  it('rotation de vecteur (q, r, s) → (−r, −s, −q), 6 pas = identité', () => {
    expect(rotateVector({ q: 1, r: 0 })).toEqual({ q: 0, r: 1 });
    expect(rotateVector({ q: 1, r: -1 })).toEqual({ q: 1, r: 0 });
    expect(rotateVector({ q: 2, r: -1 }, 6)).toEqual({ q: 2, r: -1 });
  });

  it('clés de cellule réversibles', () => {
    expect(parseKey(cellKey(-3, 7))).toEqual({ q: -3, r: 7 });
  });

  describe('bordure extérieure', () => {
    const tile = (q: number, r: number): [string, PlacedTile] => [
      cellKey(q, r),
      {
        def: { id: `${q},${r}`, edges: [], accepted: [] },
        q,
        r,
        rotation: 0,
        placedBy: 'p0',
        seq: 1,
      },
    ];

    it('un anneau de 6 tuiles laisse un lac au centre, non extérieur', () => {
      const ring = new Map(DIRECTIONS.map((d) => tile(d.q, d.r)));
      const exterior = exteriorCells(ring);
      expect(exterior.has(cellKey(0, 0))).toBe(false);
      expect(exterior.has(cellKey(2, 0))).toBe(true);
      // Toutes les tuiles de l'anneau touchent l'extérieur.
      expect(borderTiles(ring).size).toBe(6);
    });

    it('une tuile entourée de tuiles n’est pas en bordure', () => {
      const flower = new Map([tile(0, 0), ...DIRECTIONS.map((d) => tile(d.q, d.r))]);
      const border = borderTiles(flower);
      expect(border.has(cellKey(0, 0))).toBe(false);
      expect(border.size).toBe(6);
    });
  });
});
