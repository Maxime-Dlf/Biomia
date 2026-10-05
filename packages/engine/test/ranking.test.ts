import { describe, expect, it } from 'vitest';
import { boardState, finalRanking, type ScoreReport } from '../src/index.ts';
import { makeConfig, TEST_RULESET } from './helpers/fixtures.ts';

function report(totals: Record<string, [number, number]>): ScoreReport {
  const byCamp = Object.fromEntries(
    Object.entries(totals).map(([camp, [total, tokens]]) => [
      camp,
      {
        total,
        environments: 0,
        endBonuses: 0,
        tokens: { x: tokens },
        effects: 0,
        objectives: 0,
        jokers: 0,
      },
    ]),
  );
  return {
    final: true,
    byCamp,
    structures: [],
    awards: [],
    environments: [],
    neutralizedEnvs: [],
    exclusions: [],
  };
}

describe('§11.3 Égalité au total', () => {
  const state = (jokers: Record<string, number>) =>
    boardState({
      ruleSet: TEST_RULESET,
      config: makeConfig(),
      camps: ['A', 'B', 'C'],
      tiles: [],
      tokens: [],
      threshold: 2,
      jokers,
    });

  it('départage par les points de jetons, puis les jokers restants', () => {
    const r = report({ A: [20, 5], B: [20, 8], C: [12, 12] });
    expect(finalRanking(state({}), r)).toEqual([['B'], ['A'], ['C']]);
    const tie = report({ A: [20, 8], B: [20, 8], C: [3, 0] });
    expect(finalRanking(state({ A: 1, B: 2 }), tie)).toEqual([['B'], ['A'], ['C']]);
  });

  it('égalité parfaite : victoire partagée', () => {
    const tie = report({ A: [20, 8], B: [20, 8], C: [3, 0] });
    expect(finalRanking(state({}), tie)).toEqual([['A', 'B'], ['C']]);
  });
});
