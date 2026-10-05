import {
  crasseCounts,
  diffReports,
  evaluate,
  type GameEvent,
  type ScoreReport,
} from '@crassecadia/engine';
import { describe, expect, it } from 'vitest';
import {
  checkReferenceBoard,
  coreMod,
  customConfig,
  OFFICIAL_MODS,
  type ReferenceBoard,
  RuleSetError,
  referenceState,
  resolveRuleSet,
  squareD,
  tierForAll,
} from '../src/index.ts';

type Tok = [string, number, number, string, number];

function board(
  tokens: Tok[],
  extra: Partial<ReferenceBoard['config']> = {},
  tiles: ReferenceBoard['tiles'] = [],
): ReferenceBoard {
  return {
    id: 'test',
    rule: 'test',
    description: 'test',
    config: { camps: ['A', 'B'], ...extra },
    tiles,
    tokens,
    expected: {},
    validatedBy: null,
    validatedAt: null,
  };
}

const report = (b: ReferenceBoard): ScoreReport => evaluate(referenceState(b));
const events = (before: ReferenceBoard, after: ReferenceBoard): GameEvent[] =>
  diffReports(report(before), report(after));

describe('§20.1 Garde-fou des plateaux de référence', () => {
  it('un score attendu faux est signalé', () => {
    const wrong: ReferenceBoard = {
      ...board([['triangle', 0, 0, 'A', 1]]),
      expected: { A: { tokens: { triangle: 3 } } },
    };
    expect(checkReferenceBoard(wrong).mismatches).toEqual([
      'A.tokens.triangle : attendu 3, obtenu 2',
    ]);
  });
});

describe('§7.4 ScoreReport', () => {
  it('statuts : cœurs en triangle invalidés, segment valide', () => {
    const r = report(
      board([
        ['heart', 0, 0, 'A', 1],
        ['heart', 1, 0, 'A', 2],
        ['heart', 1, -1, 'A', 3],
        ['heart', 5, 0, 'B', 4],
      ]),
    );
    const hearts = r.structures.filter((s) => s.shape === 'core:heart');
    expect(hearts.find((s) => s.members.length === 3)?.status).toBe('invalidated');
    expect(hearts.find((s) => s.members.includes('5,0'))).toMatchObject({
      status: 'valid',
      owner: 'B',
      points: 2,
    });
  });

  it('supports : les voisins d’une étoile sont des supports, pas des membres (§7.3)', () => {
    const r = report(
      board([
        ['star', 0, 0, 'A', 1],
        ['square', 1, 0, 'B', 2],
        ['heart', -1, 0, 'B', 3],
      ]),
    );
    const star = r.structures.find((s) => s.shape === 'core:star')!;
    expect(star.members).toEqual(['0,0']);
    expect([...(star.supports ?? [])].sort()).toEqual(['-1,0', '1,0']);
  });

  it('jetons bloqués : statut « bloquée » dans le rapport (§9.4.4)', () => {
    const r = report(
      board(
        [
          ['circle', 0, 0, 'A', 1],
          ['square', 1, 0, 'B', 2],
        ],
        { tierByShape: { circle: 'C' } },
      ),
    );
    expect(r.exclusions).toEqual([
      { cell: '1,0', status: 'blocked', by: 'C/circle[core:circle]:0,0' },
    ]);
    expect(r.structures.find((s) => s.members.includes('1,0'))?.status).toBe('blocked');
  });

  it('partitions disjointes : un jeton est membre d’une seule structure par forme (§7.3)', () => {
    const r = report(
      board([
        ['triangle', -1, 0, 'A', 1],
        ['triangle', 0, 0, 'A', 2],
        ['triangle', 1, 0, 'A', 3],
        ['triangle', 0, 1, 'A', 4],
        ['triangle', 0, -1, 'B', 5],
        ['triangle', 1, -1, 'B', 6],
      ]),
    );
    const members = r.structures
      .filter((s) => s.shape === 'core:triangle')
      .flatMap((s) => s.members);
    expect(new Set(members).size).toBe(members.length);
    expect(members).toHaveLength(6);
  });
});

describe('§7.4 Événements par différence de rapports', () => {
  it('vol : B prolonge la ligne de A', () => {
    const before = board([
      ['triangle', 0, 0, 'A', 1],
      ['triangle', 1, 0, 'A', 2],
    ]);
    const after = board([
      ['triangle', 0, 0, 'A', 1],
      ['triangle', 1, 0, 'A', 2],
      ['triangle', 2, 0, 'B', 3],
    ]);
    const evts = events(before, after);
    expect(evts).toContainEqual(
      expect.objectContaining({ type: 'OwnershipChanged', from: 'A', to: 'B', kind: 'line' }),
    );
    expect(crasseCounts(evts, 'B')).toEqual({ steals: 1, invalidations: 0 });
  });

  it('vol d’environnement : B agrandit l’environnement valide de A', () => {
    const tiles = (n: number): ReferenceBoard['tiles'] =>
      Array.from({ length: n }, (_, i) => ({
        q: i,
        r: 0,
        mono: 'E0',
        placedBy: i < 2 ? 'A' : 'B',
        seq: i + 1,
      }));
    const evts = events(
      board([], { threshold: 2 }, tiles(2)),
      board([], { threshold: 2 }, tiles(3)),
    );
    expect(evts).toContainEqual(
      expect.objectContaining({
        type: 'OwnershipChanged',
        kind: 'environment',
        from: 'A',
        to: 'B',
      }),
    );
  });

  it('invalidation : un carré de B casse la paire de A', () => {
    const before = board([
      ['square', 0, 0, 'A', 1],
      ['square', 1, 0, 'A', 2],
    ]);
    const after = board([
      ['square', 0, 0, 'A', 1],
      ['square', 1, 0, 'A', 2],
      ['square', 2, 0, 'B', 3],
    ]);
    const evts = events(before, after);
    expect(evts).toContainEqual(
      expect.objectContaining({ type: 'StructureInvalidated', owner: 'A', cause: 'invalidated' }),
    );
    expect(crasseCounts(evts, 'B')).toEqual({ steals: 0, invalidations: 1 });
  });

  it('blocage : un rond C de B bloque la paire de carrés de A', () => {
    const config = { tierByShape: { circle: 'C' } };
    const before = board(
      [
        ['square', 0, 0, 'A', 1],
        ['square', 1, 0, 'A', 2],
      ],
      config,
    );
    const after = board(
      [
        ['square', 0, 0, 'A', 1],
        ['square', 1, 0, 'A', 2],
        ['circle', 2, 0, 'B', 3],
      ],
      config,
    );
    const evts = events(before, after);
    expect(evts).toContainEqual({
      type: 'TokenBlocked',
      cell: '1,0',
      by: 'C/circle[core:circle]:2,0',
    });
    expect(evts).toContainEqual(
      expect.objectContaining({ type: 'StructureInvalidated', cause: 'blocked', owner: 'A' }),
    );
  });

  it('un coéquipier ou soi-même n’est pas « volé »', () => {
    const before = board([
      ['triangle', 0, 0, 'A', 1],
      ['triangle', 1, 0, 'A', 2],
    ]);
    const after = board([
      ['triangle', 0, 0, 'A', 1],
      ['triangle', 1, 0, 'A', 2],
      ['triangle', 2, 0, 'A', 3],
    ]);
    expect(events(before, after).filter((e) => e.type === 'OwnershipChanged')).toEqual([]);
  });
});

describe('§17.3 Résolution du RuleSet et §9.5 mélange de tiers', () => {
  it('un tier par forme : Ronds C (étape 1) avec Carrés D (étape 2)', () => {
    const config = customConfig([], { tierByShape: { ...tierForAll('D'), 'core:circle': 'C' } });
    const ruleSet = resolveRuleSet(config, OFFICIAL_MODS);
    const stages = ruleSet.scorers.map((s) => `${s.stage}:${s.id}`);
    expect(stages).toContain('pre-effects:C/circle[core:circle]');
    expect(stages).toContain('structures:D/square[core:square]');
  });

  it('une forme sans scorer pour son tier est refusée', () => {
    const config = customConfig([], { tierByShape: { ...tierForAll('D'), 'core:star': 'Z' } });
    expect(() => resolveRuleSet(config, OFFICIAL_MODS)).toThrow(RuleSetError);
  });

  it('une forme de mod réutilise un scorer officiel par référence (§9.5)', () => {
    const dragons = {
      id: 'dragons',
      version: '1.0.0',
      dependencies: ['core'],
      shapes: [{ id: 'dragons:dragon', name: { fr: 'Dragon' } }],
      tiers: [{ id: 'D', name: { fr: 'D' }, byShape: { 'dragons:dragon': squareD } }],
    };
    const config = customConfig([], {
      activeShapes: ['core:square', 'dragons:dragon'],
      tierByShape: { 'core:square': 'D', 'dragons:dragon': 'D' },
    });
    const ruleSet = resolveRuleSet(config, [...OFFICIAL_MODS, dragons]);
    expect(ruleSet.scorers.some((s) => s.id === 'D/square[dragons:dragon]')).toBe(true);
  });

  it('dépendance manquante ou circulaire refusée', () => {
    const lonely = { id: 'x', version: '1.0.0', dependencies: ['absent'] };
    expect(() => resolveRuleSet(customConfig([]), [coreMod, lonely])).toThrow(/absent/);
  });

  it('redéfinition d’une forme sans « overrides » refusée', () => {
    const clash = {
      id: 'clash',
      version: '1.0.0',
      shapes: [{ id: 'core:square', name: { fr: 'X' } }],
    };
    expect(() => resolveRuleSet(customConfig([]), [...OFFICIAL_MODS, clash])).toThrow(/redéfinie/);
  });
});
