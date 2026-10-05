import {
  boardState,
  type GameState,
  type PlacedTile,
  type PlacedToken,
  type Rotation,
  rngFromSeed,
} from '@crassecadia/engine';
import { CORE_ENVS, CORE_SHAPES, customConfig, officialRuleSet, tierForAll } from '../src/index.ts';

/** Plateau aléatoire compact de `n` tuiles (70 % portent un jeton), 4 camps. */
export function randomBoard(n: number, tier: string, seed = 'perf'): GameState {
  const rng = rngFromSeed(seed);
  const tiles: PlacedTile[] = [];
  const tokens: PlacedToken[] = [];
  const side = Math.ceil(Math.sqrt(n));
  let seq = 0;
  for (let i = 0; i < n; i++) {
    const q = i % side;
    const r = Math.floor(i / side);
    const a = CORE_ENVS[rng.int(5)]!;
    const b = CORE_ENVS[rng.int(5)]!;
    tiles.push({
      def: { id: `t${i}`, edges: [a, a, a, b, b, b], accepted: CORE_SHAPES },
      q,
      r,
      rotation: rng.int(6) as Rotation,
      placedBy: `c${rng.int(4)}`,
      seq: ++seq,
    });
    if (rng.int(10) < 7) {
      tokens.push({
        shape: CORE_SHAPES[rng.int(5)]!,
        q,
        r,
        placedBy: `c${rng.int(4)}`,
        seq: ++seq,
      });
    }
  }
  const config = customConfig([], { tierByShape: tierForAll(tier) });
  return boardState({
    ruleSet: officialRuleSet(config),
    config,
    camps: ['c0', 'c1', 'c2', 'c3'],
    tiles,
    tokens,
    threshold: 8,
  });
}
