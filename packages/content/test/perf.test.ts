import { evaluate } from '@crassecadia/engine';
import { describe, expect, it } from 'vitest';
import { randomBoard } from './helpers.ts';

/**
 * Budgets de performance du §20.2. Dépendants de la machine : activés avec `PERF=1`.
 * Mesure : médiane de plusieurs évaluations après un échauffement.
 */
const enabled = process.env.PERF === '1';

function median(run: () => unknown, times: number): number {
  run();
  const samples: number[] = [];
  for (let i = 0; i < times; i++) {
    const t0 = performance.now();
    run();
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)]!;
}

describe.skipIf(!enabled)('§20.2 Budgets de performance de evaluate', () => {
  for (const tier of ['A', 'B', 'C', 'D']) {
    it(`Tier ${tier} : 1 000 tuiles < 5 ms`, () => {
      const state = randomBoard(1_000, tier);
      expect(median(() => evaluate(state), 15)).toBeLessThan(5);
    });
    it(`Tier ${tier} : 50 000 tuiles < 100 ms`, { timeout: 60_000 }, () => {
      const state = randomBoard(50_000, tier);
      expect(median(() => evaluate(state), 5)).toBeLessThan(100);
    });
  }
});
