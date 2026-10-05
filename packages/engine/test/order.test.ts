import { describe, expect, it } from 'vitest';
import { computeTurnOrder, rngFromSeed, teamCycle } from '../src/index.ts';
import { makeConfig } from './helpers/fixtures.ts';

describe('§11.1 Ordre de passage en équipes', () => {
  it('3 contre 1 : A1 B1 A2 B1 A3 B1', () => {
    expect(teamCycle([['A1', 'A2', 'A3'], ['B1']])).toEqual(['A1', 'B1', 'A2', 'B1', 'A3', 'B1']);
  });

  it('2 contre 2 : A1 B1 A2 B2', () => {
    expect(
      teamCycle([
        ['A1', 'A2'],
        ['B1', 'B2'],
      ]),
    ).toEqual(['A1', 'B1', 'A2', 'B2']);
  });

  it('les équipes inégales jouent autant de tours chacune', () => {
    const cycle = teamCycle([['A1', 'A2', 'A3'], ['B1'], ['C1', 'C2']]);
    const byTeam = (p: string) => cycle.filter((s) => s.startsWith(p)).length;
    expect(byTeam('A')).toBe(3);
    expect(byTeam('B')).toBe(3);
    expect(byTeam('C')).toBe(3);
  });
});

describe('§5.3 J1 et ordre de passage', () => {
  it('ordre des sièges : rotation à partir de J1 tiré au sort', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const { cycle } = computeTurnOrder(makeConfig({ seatCount: 4 }), rngFromSeed(`o${i}`));
      const j1 = Number(cycle[0]!.slice(1));
      expect(cycle).toEqual([0, 1, 2, 3].map((k) => `p${(j1 + k) % 4}`));
      seen.add(cycle[0]!);
    }
    expect(seen.size).toBe(4);
  });

  it('aléatoire : une permutation des sièges', () => {
    const config = makeConfig({ seatCount: 5, options: { turnOrder: 'random' } });
    const { cycle } = computeTurnOrder(config, rngFromSeed('r'));
    expect([...cycle].sort()).toEqual(['p0', 'p1', 'p2', 'p3', 'p4']);
  });

  it('équipes : l’équipe de J1 commence, J1 ouvre son équipe ; chaque siège pose sa tuile de départ', () => {
    const config = makeConfig({
      seatCount: 4,
      teams: [
        { id: 'A', name: 'A', seats: ['p0', 'p1', 'p2'] },
        { id: 'B', name: 'B', seats: ['p3'] },
      ],
    });
    for (let i = 0; i < 20; i++) {
      const { cycle, startOrder } = computeTurnOrder(config, rngFromSeed(`t${i}`));
      expect(cycle).toHaveLength(6);
      expect([...startOrder].sort()).toEqual(['p0', 'p1', 'p2', 'p3']);
      const j1 = cycle[0]!;
      if (j1 === 'p3') expect(cycle).toEqual(['p3', 'p0', 'p3', 'p1', 'p3', 'p2']);
      else expect(cycle[1]).toBe('p3');
    }
  });
});
