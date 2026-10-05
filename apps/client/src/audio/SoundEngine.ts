/**
 * `SoundEngine` (§14.5) : traduit les événements du moteur en sons, sans couplage avec les règles.
 * En attendant les sons de l'artiste (`assets/source/sfx_<événement>.wav`, §14.7), chaque son est
 * synthétisé par Web Audio (oscillateurs et bruit), sans aucun fichier.
 *
 * Le contexte audio ne démarre qu'après une interaction de l'utilisateur (règle des navigateurs).
 */
import type { GameEvent, SeatId } from '@crassecadia/engine';

export type SoundId =
  | 'tile'
  | 'token'
  | 'steal'
  | 'invalidated'
  | 'blocked'
  | 'absorbed'
  | 'joker'
  | 'your-turn'
  | 'reroll'
  | 'game-over';

interface Voice {
  readonly type: OscillatorType | 'noise';
  readonly from: number;
  readonly to: number;
  readonly duration: number;
  readonly gain: number;
  readonly delay?: number;
}

/** Sons de substitution, courts et discrets. */
const VOICES: Readonly<Record<SoundId, readonly Voice[]>> = {
  tile: [{ type: 'sine', from: 140, to: 70, duration: 0.12, gain: 0.5 }],
  token: [{ type: 'triangle', from: 660, to: 520, duration: 0.07, gain: 0.25 }],
  steal: [
    { type: 'sawtooth', from: 520, to: 180, duration: 0.25, gain: 0.18 },
    { type: 'sine', from: 90, to: 60, duration: 0.2, gain: 0.45, delay: 0.2 },
  ],
  invalidated: [{ type: 'noise', from: 0, to: 0, duration: 0.18, gain: 0.25 }],
  blocked: [{ type: 'square', from: 110, to: 100, duration: 0.18, gain: 0.12 }],
  absorbed: [{ type: 'sine', from: 900, to: 120, duration: 0.4, gain: 0.2 }],
  joker: [
    { type: 'sine', from: 880, to: 880, duration: 0.08, gain: 0.2 },
    { type: 'sine', from: 1320, to: 1320, duration: 0.12, gain: 0.2, delay: 0.08 },
  ],
  'your-turn': [
    { type: 'sine', from: 523, to: 523, duration: 0.1, gain: 0.2 },
    { type: 'sine', from: 784, to: 784, duration: 0.16, gain: 0.2, delay: 0.1 },
  ],
  reroll: [{ type: 'triangle', from: 300, to: 600, duration: 0.15, gain: 0.15 }],
  'game-over': [
    { type: 'sine', from: 392, to: 392, duration: 0.2, gain: 0.2 },
    { type: 'sine', from: 523, to: 523, duration: 0.2, gain: 0.2, delay: 0.2 },
    { type: 'sine', from: 659, to: 659, duration: 0.35, gain: 0.2, delay: 0.4 },
  ],
};

/** Sons d'un lot d'événements, sans doublon (`mine` : le siège est joué sur cet appareil). */
export function soundsFor(
  events: readonly GameEvent[],
  mine: (seat: SeatId) => boolean,
): SoundId[] {
  const out = new Set<SoundId>();
  for (const e of events) {
    switch (e.type) {
      case 'TilePlaced':
        out.add('tile');
        break;
      case 'TokenPlaced':
        out.add('token');
        break;
      case 'OwnershipChanged':
        out.add('steal');
        break;
      case 'StructureInvalidated':
        out.add(e.cause === 'invalidated' ? 'invalidated' : e.cause);
        break;
      case 'JokerGained':
        out.add('joker');
        break;
      case 'Rerolled':
        out.add('reroll');
        break;
      case 'TurnStarted':
        if (mine(e.seat)) out.add('your-turn');
        break;
      case 'GameEnded':
        out.add('game-over');
        break;
      default:
        break;
    }
  }
  return [...out];
}

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private volume = 0.8;
  private readonly unlock = () => this.context();

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('pointerdown', this.unlock, { once: true });
      window.addEventListener('keydown', this.unlock, { once: true });
    }
  }

  /** Volume de 0 à 100 (paramètres globaux, §13.5). */
  setVolume(percent: number): void {
    this.volume = Math.max(0, Math.min(100, percent)) / 100;
    if (this.master) this.master.gain.value = this.volume;
  }

  private context(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor = typeof window !== 'undefined' ? window.AudioContext : undefined;
    if (!Ctor) return null;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    return this.ctx;
  }

  play(events: readonly GameEvent[], mine: (seat: SeatId) => boolean): void {
    if (this.volume === 0 || !this.ctx || this.ctx.state !== 'running') return;
    for (const id of soundsFor(events, mine)) this.voice(id);
  }

  private voice(id: SoundId): void {
    const ctx = this.ctx!;
    for (const v of VOICES[id]) {
      const start = ctx.currentTime + (v.delay ?? 0);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(v.gain, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + v.duration);
      gain.connect(this.master!);
      if (v.type === 'noise') {
        const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * v.duration), ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(gain);
        src.start(start);
      } else {
        const osc = ctx.createOscillator();
        osc.type = v.type;
        osc.frequency.setValueAtTime(v.from, start);
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, v.to), start + v.duration);
        osc.connect(gain);
        osc.start(start);
        osc.stop(start + v.duration + 0.02);
      }
    }
  }

  dispose(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('pointerdown', this.unlock);
      window.removeEventListener('keydown', this.unlock);
    }
    void this.ctx?.close();
    this.ctx = null;
  }
}
