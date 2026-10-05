import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { deriveRng, rngFromSeed, rngFromState } from '../src/index.ts';

describe('§15.1 RNG à graine', () => {
  it('même graine → même séquence', () => {
    const a = rngFromSeed('abc');
    const b = rngFromSeed('abc');
    for (let i = 0; i < 100; i++) expect(a.nextU32()).toBe(b.nextU32());
  });

  it('graines différentes → séquences différentes', () => {
    expect(rngFromSeed('abc').nextU32()).not.toBe(rngFromSeed('abd').nextU32());
  });

  it("l'état sérialisé permet de reprendre la séquence", () => {
    const a = rngFromSeed('x');
    a.int(10);
    const b = rngFromState(a.state());
    for (let i = 0; i < 50; i++) expect(b.int(1000)).toBe(a.int(1000));
  });

  it('un RNG dérivé ne modifie pas la séquence principale', () => {
    const a = rngFromSeed('x');
    const state = a.state();
    deriveRng(state, 'autoplay').int(5);
    expect(a.state()).toBe(state);
  });

  it('int(n) reste dans [0, n) et shuffle est une permutation', () => {
    fc.assert(
      fc.property(fc.string(), fc.integer({ min: 1, max: 1000 }), (seed, n) => {
        const rng = rngFromSeed(seed);
        for (let i = 0; i < 20; i++) {
          const v = rng.int(n);
          if (v < 0 || v >= n || !Number.isInteger(v)) return false;
        }
        const items = Array.from({ length: n % 30 }, (_, i) => i);
        return (
          rng
            .shuffle(items)
            .sort((x, y) => x - y)
            .join() === items.join()
        );
      }),
    );
  });

  it('int(n) est à peu près uniforme', () => {
    const rng = rngFromSeed('uniform');
    const counts = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 60_000; i++) counts[rng.int(6)]! += 1;
    for (const c of counts) expect(Math.abs(c - 10_000)).toBeLessThan(500);
  });
});
