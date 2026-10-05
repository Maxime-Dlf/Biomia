import { describe, expect, it } from 'vitest';
import {
  balancedTileGenerator,
  buildPool,
  capacityCounts,
  computeThreshold,
  computeTileCount,
  generateDeck,
  generateStartTiles,
  poolTotal,
  rngFromSeed,
  type TileDef,
} from '../src/index.ts';
import { ENVS, makeConfig, SHAPES, TEST_RULESET } from './helpers/fixtures.ts';

function edgeCounts(tiles: readonly TileDef[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of tiles) for (const e of t.edges) m.set(e, (m.get(e) ?? 0) + 1);
  return m;
}

function spread(values: Iterable<number>): number {
  const v = [...values];
  return Math.max(...v) - Math.min(...v);
}

describe('§4.3 Nombre de tuiles T', () => {
  it('individuel : T = manches × sièges + m', () => {
    expect(computeTileCount(makeConfig({ seatCount: 2, rounds: 20 }))).toBe(44);
    expect(computeTileCount(makeConfig({ seatCount: 4, rounds: 20 }))).toBe(84);
  });

  it('équipes : T = taille_max × nb_équipes × manches + m', () => {
    const config = makeConfig({
      seatCount: 4,
      rounds: 20,
      teams: [
        { id: 'A', name: 'A', seats: ['p0', 'p1', 'p2'] },
        { id: 'B', name: 'B', seats: ['p3'] },
      ],
    });
    expect(computeTileCount(config)).toBe(3 * 2 * 20 + 4);
  });
});

describe('§8.2 Seuil S = max(2, ⌈(T − m) / 10⌉)', () => {
  it('1v1 en 20 manches → S = 4 ; FFA 4 ou 2v2 → S = 8', () => {
    expect(computeThreshold(44, 4, 10)).toBe(4);
    expect(computeThreshold(84, 4, 10)).toBe(8);
    expect(computeThreshold(6, 4, 10)).toBe(2);
  });
});

describe('§4.4 Génération de la pioche', () => {
  it('étape 1 : ratio 1:2:2, reste distribué dans l’ordre 1, 2, 3, 2', () => {
    expect(capacityCounts(44, [1, 2, 2])).toEqual([9, 18, 17]);
    expect(capacityCounts(40, [1, 2, 2])).toEqual([8, 16, 16]);
    expect(capacityCounts(41, [1, 2, 2])).toEqual([9, 16, 16]);
    expect(capacityCounts(42, [1, 2, 2])).toEqual([9, 17, 16]);
    expect(capacityCounts(43, [1, 2, 2])).toEqual([9, 17, 17]);
  });

  const deckFor = (T: number, seed: string) =>
    generateDeck(makeConfig(), TEST_RULESET, T, rngFromSeed(seed));

  it('la pioche contient exactement T tuiles, ids uniques', () => {
    for (const T of [5, 44, 84, 123]) {
      const deck = deckFor(T, `d${T}`);
      expect(deck).toHaveLength(T);
      expect(new Set(deck.map((t) => t.id)).size).toBe(T);
    }
  });

  it('étape 2 : capacité 1 monochrome, capacités 2–3 bicolores [A, A, A, B, B, B]', () => {
    for (const t of deckFor(84, 'colors')) {
      const distinct = new Set(t.edges);
      expect(t.edges).toHaveLength(6);
      if (t.accepted.length === 1) {
        expect(distinct.size).toBe(1);
      } else {
        expect(distinct.size).toBe(2);
        expect(t.edges[0]).toBe(t.edges[1]);
        expect(t.edges[1]).toBe(t.edges[2]);
        expect(t.edges[3]).toBe(t.edges[4]);
        expect(t.edges[4]).toBe(t.edges[5]);
      }
    }
  });

  it('étape 2 : arêtes équilibrées entre couleurs et paires en tourniquet', () => {
    for (const seed of ['a', 'b', 'c', 'd']) {
      for (const T of [44, 84, 63]) {
        const deck = deckFor(T, seed + T);
        // Monochromes en tourniquet (écart ≤ 6 arêtes) ; le cycle de paires incomplet ne peut
        // pas réutiliser une paire, d'où un écart résiduel borné à 9 (mesuré sur 2 000 pioches).
        expect(spread(edgeCounts(deck).values())).toBeLessThanOrEqual(9);
        const pairCounts = new Map<string, number>();
        for (const t of deck) {
          if (t.accepted.length > 1) {
            const k = [...new Set(t.edges)].sort().join('|');
            pairCounts.set(k, (pairCounts.get(k) ?? 0) + 1);
          }
        }
        const counts = [...pairCounts.values()];
        while (counts.length < 10) counts.push(0);
        expect(spread(counts)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('étape 3 : formes distinctes, écart d’usage entre formes ≤ 1', () => {
    for (const T of [44, 84, 17]) {
      const deck = deckFor(T, `shapes${T}`);
      const usage = new Map<string, number>(SHAPES.map((s) => [s, 0]));
      for (const t of deck) {
        expect(new Set(t.accepted).size).toBe(t.accepted.length);
        for (const s of t.accepted) usage.set(s, usage.get(s)! + 1);
      }
      expect(spread(usage.values())).toBeLessThanOrEqual(1);
    }
  });

  it('déterministe : même graine → même pioche', () => {
    expect(deckFor(44, 'same')).toEqual(deckFor(44, 'same'));
    expect(deckFor(44, 'same')).not.toEqual(deckFor(44, 'other'));
  });

  it('générateur : groupes par capacité aux tailles demandées', () => {
    const groups = balancedTileGenerator(
      { countsByCapacity: [3, 4, 5], shapes: SHAPES, envs: ENVS, idPrefix: 'x' },
      rngFromSeed('g'),
    );
    expect(groups.map((g) => g.length)).toEqual([3, 4, 5]);
    groups.forEach((g, i) => {
      for (const t of g) expect(t.accepted).toHaveLength(i + 1);
    });
  });
});

describe('§4.6 Tuiles de départ', () => {
  it('une cellule de capacité 1, 2 et 3 par siège, formes équilibrées', () => {
    const seats = ['p0', 'p1', 'p2', 'p3'];
    const starts = generateStartTiles(
      makeConfig({ seatCount: 4 }),
      TEST_RULESET,
      seats,
      rngFromSeed('st'),
    );
    expect(starts.map((s) => s.seat)).toEqual(seats);
    for (const st of starts) expect(st.cells.map((c) => c.accepted.length)).toEqual([1, 2, 3]);
    const usage = new Map<string, number>(SHAPES.map((s) => [s, 0]));
    for (const t of starts.flatMap((s) => s.cells)) {
      for (const s of t.accepted) usage.set(s, usage.get(s)! + 1);
    }
    expect(spread(usage.values())).toBeLessThanOrEqual(1);
  });

  it('remaniées à chaque partie (graine différente)', () => {
    const gen = (seed: string) =>
      generateStartTiles(makeConfig(), TEST_RULESET, ['p0', 'p1'], rngFromSeed(seed));
    expect(gen('one')).not.toEqual(gen('two'));
  });

  it('avec 2 formes actives, les capacités sont limitées à 2', () => {
    const config = makeConfig({ activeShapes: SHAPES.slice(0, 2) });
    const starts = generateStartTiles(config, TEST_RULESET, ['p0'], rngFromSeed('two'));
    expect(starts[0]!.cells.map((c) => c.accepted.length)).toEqual([1, 2, 2]);
  });
});

describe('§4.5 Pool de jetons', () => {
  it('1 jeton par forme acceptée, pioche + cellules de départ', () => {
    const config = makeConfig();
    const rng = rngFromSeed('pool');
    const deck = generateDeck(config, TEST_RULESET, 44, rng);
    const starts = generateStartTiles(config, TEST_RULESET, ['p0', 'p1'], rng);
    const pool = buildPool(SHAPES, deck, starts);
    const expected = [...deck, ...starts.flatMap((s) => s.cells)].reduce(
      (n, t) => n + t.accepted.length,
      0,
    );
    expect(poolTotal(pool)).toBe(expected);
    expect(Object.keys(pool)).toEqual(SHAPES);
  });
});
