/**
 * Scènes de référence (développement uniquement) : plateaux déterministes pour les captures de
 * non-régression visuelle et la mesure des FPS (§20.1, §20.2). Affichées en spectateur, sans bot ni
 * minuteur.
 *
 * - `?scene=board` : une partie à 3 sièges jouée par `autoPlay` jusqu'à 12 tours ;
 * - `?scene=large` : un plateau compact de 1 000 tuiles (budget du §20.2).
 */
import {
  CORE_ENVS,
  CORE_SHAPES,
  createOfficialGame,
  customConfig,
  officialRuleSet,
} from '@crassecadia/content';
import {
  activeSeat,
  applyAction,
  autoPlay,
  boardState,
  type GameState,
  type PlacedTile,
  type PlacedToken,
  type Replay,
  type Rotation,
  rngFromSeed,
  type SeatId,
} from '@crassecadia/engine';
import type { DriverUpdate, GameDriver, SendResult } from './driver.ts';

function playedBoard(): GameState {
  const seats = ['a', 'b', 'c'].map((id) => ({ id, name: id.toUpperCase(), bot: null }));
  const config = customConfig(seats, {
    rounds: 6,
    options: {
      objectives: {
        enabled: false,
        initialHigh: 1,
        initialLow: 2,
        broken: 'return-fixed-penalty',
        brokenPenalty: 2,
      },
    },
  });
  let s = createOfficialGame(config, 'scene');
  while (s.phase !== 'ended' && s.turnIndex < 12) {
    const seat = activeSeat(s);
    if (!seat) break;
    for (const action of autoPlay(s, seat)) {
      const res = applyAction(s, action);
      if (!res.ok) throw new Error(res.reason);
      s = res.state;
    }
  }
  return s;
}

/** Plateau compact de `n` tuiles (70 % portent un jeton), 4 camps. */
function largeBoard(n: number): GameState {
  const rng = rngFromSeed('large');
  const tiles: PlacedTile[] = [];
  const tokens: PlacedToken[] = [];
  const side = Math.ceil(Math.sqrt(n));
  let seq = 0;
  for (let i = 0; i < n; i++) {
    const q = (i % side) - Math.floor(i / side / 2);
    const r = Math.floor(i / side);
    const a = CORE_ENVS[rng.int(5)]!;
    const b = CORE_ENVS[rng.int(5)]!;
    const accepted = rng.shuffle(CORE_SHAPES).slice(0, 1 + rng.int(3));
    tiles.push({
      def: { id: `t${i}`, edges: [a, a, a, b, b, b], accepted },
      q,
      r,
      rotation: rng.int(6) as Rotation,
      placedBy: `c${rng.int(4)}`,
      seq: ++seq,
    });
    if (rng.int(10) < 7) {
      tokens.push({ shape: accepted[0]!, q, r, placedBy: `c${rng.int(4)}`, seq: ++seq });
    }
  }
  const seats = ['c0', 'c1', 'c2', 'c3'].map((id) => ({ id, name: id, bot: null }));
  const config = customConfig(seats);
  return {
    ...boardState({
      ruleSet: officialRuleSet(config),
      config,
      camps: ['c0', 'c1', 'c2', 'c3'],
      tiles,
      tokens,
      threshold: 8,
    }),
    phase: 'playing',
  };
}

/** Pilote immobile : un état fixe, regardé en spectateur. */
export class SceneDriver implements GameDriver {
  readonly localSeats: readonly SeatId[] = [];
  readonly sharedScreen = false;
  readonly spectator = true;
  readonly current: DriverUpdate;

  constructor(state: GameState) {
    this.current = { state, events: [], deadline: null };
  }

  subscribe(listener: (u: DriverUpdate) => void): () => void {
    listener(this.current);
    return () => {};
  }

  send(): SendResult {
    return { ok: false, reason: 'scene' };
  }

  replay(): Replay | null {
    return null;
  }

  dispose(): void {}
}

export function sceneState(name: string): GameState | null {
  if (name === 'board') return playedBoard();
  if (name === 'large') return largeBoard(1000);
  return null;
}
