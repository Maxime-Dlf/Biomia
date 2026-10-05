/**
 * Pilote local (hors-ligne, §12.1) : le moteur tourne dans le navigateur, les bots jouent après un
 * court délai, et `autoPlay` termine le tour à l'expiration du minuteur (§6.10).
 */

import { createOfficialGame } from '@crassecadia/content';
import {
  type Action,
  actingSeats,
  activeSeat,
  applyAction,
  autoPlay,
  type BotLevel,
  botAction,
  type GameConfig,
  type GameEvent,
  type GameState,
  type Replay,
  type Rng,
  rngFromSeed,
  type SeatId,
  SYSTEM_SEAT,
} from '@crassecadia/engine';
import type { DriverUpdate, GameDriver, SendResult } from './driver.ts';

/** Délai entre deux actions d'un bot, pour que les humains suivent la partie. */
const BOT_DELAY_MS = 350;
/** Minuteur des votes d'objectifs (§10.5 : 30 s au tirage initial, 20 s au ravitaillement). */
const VOTE_TIMER_MS = { initial: 30_000, resupply: 20_000 } as const;

export class LocalDriver implements GameDriver {
  readonly localSeats: readonly SeatId[];
  private state: GameState;
  private pending: GameEvent[] = [];
  private deadline: number | null = null;
  private readonly listeners = new Set<(u: DriverUpdate) => void>();
  private readonly rng: Rng;
  private botTimer: ReturnType<typeof setTimeout> | null = null;
  private turnTimer: ReturnType<typeof setTimeout> | null = null;
  private timerKey = '';
  private disposed = false;
  /** Actions appliquées, pour l'export du replay (§15.4). */
  readonly history: Action[] = [];

  constructor(
    readonly config: GameConfig,
    readonly seed: string,
  ) {
    this.state = createOfficialGame(config, seed);
    this.localSeats = config.seats.filter((s) => s.bot === null).map((s) => s.id);
    this.rng = rngFromSeed(`${seed}:bots`);
    queueMicrotask(() => this.schedule());
  }

  readonly spectator = false;

  get sharedScreen(): boolean {
    return this.localSeats.length > 1;
  }

  replay(): Replay {
    return { config: this.config, seed: this.seed, actions: this.history };
  }

  get current(): DriverUpdate {
    return { state: this.state, events: this.pending, deadline: this.deadline };
  }

  subscribe(listener: (u: DriverUpdate) => void): () => void {
    this.listeners.add(listener);
    listener(this.current);
    return () => this.listeners.delete(listener);
  }

  send(action: Action): SendResult {
    if (this.disposed) return { ok: false, reason: 'disposed' };
    const res = applyAction(this.state, action);
    if (!res.ok) return res;
    this.state = res.state;
    this.history.push(action);
    this.pending = [...res.events];
    this.schedule();
    this.emit();
    return { ok: true };
  }

  dispose(): void {
    this.disposed = true;
    if (this.botTimer) clearTimeout(this.botTimer);
    if (this.turnTimer) clearTimeout(this.turnTimer);
    this.listeners.clear();
  }

  private emit(): void {
    const update = this.current;
    for (const l of this.listeners) l(update);
    this.pending = [];
  }

  private botLevel(seat: SeatId): BotLevel | null {
    return this.config.seats.find((s) => s.id === seat)?.bot ?? null;
  }

  /** Programme le prochain coup de bot et le minuteur du tour ou du vote en cours. */
  private schedule(): void {
    if (this.botTimer) clearTimeout(this.botTimer);
    this.botTimer = null;
    if (this.state.phase === 'ended') {
      this.clearTurnTimer();
      return;
    }
    const bot = actingSeats(this.state).find((s) => this.botLevel(s) !== null);
    if (bot) {
      this.botTimer = setTimeout(() => {
        const action = botAction(this.botLevel(bot)!, this.state, bot, this.rng);
        if (action) this.send(action);
      }, BOT_DELAY_MS);
    }
    this.scheduleTimer();
  }

  private clearTurnTimer(): void {
    if (this.turnTimer) clearTimeout(this.turnTimer);
    this.turnTimer = null;
    this.deadline = null;
    this.timerKey = '';
  }

  private scheduleTimer(): void {
    const s = this.state;
    const vote = s.objectives?.vote;
    // Le minuteur du tour est en pause pendant un ravitaillement (§10.5).
    const key = vote
      ? `vote:${vote.kind}:${s.turnIndex}`
      : `${s.phase}:${s.turnIndex}:${s.startIndex}`;
    if (key === this.timerKey) return;
    this.clearTurnTimer();
    this.timerKey = key;
    const duration = vote
      ? VOTE_TIMER_MS[vote.kind]
      : s.phase === 'startTiles'
        ? 30_000
        : this.config.turnTimerMs;
    if (duration === null) return;
    this.deadline = Date.now() + duration;
    this.turnTimer = setTimeout(() => this.expire(), duration);
  }

  /** Expiration : clôture du vote, ou `autoPlay` du siège actif (§6.10). */
  private expire(): void {
    this.timerKey = '';
    if (this.state.objectives?.vote) {
      this.send({ type: 'closeObjectiveVote', seat: SYSTEM_SEAT });
      return;
    }
    const seat = activeSeat(this.state);
    if (!seat) return;
    for (const action of autoPlay(this.state, seat)) {
      if (!this.send(action).ok) break;
    }
  }
}
