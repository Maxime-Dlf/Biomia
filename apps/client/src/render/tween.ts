/**
 * Interpolations des animations (§14.5), pilotées par le ticker de Pixi : temps fourni par
 * l'appelant, donc déterministes et testables.
 */

export type Easing = (t: number) => number;

export const ease = {
  linear: (t: number) => t,
  outCubic: (t: number) => 1 - (1 - t) ** 3,
  inCubic: (t: number) => t ** 3,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2),
  /** Chute avec léger rebond. */
  outBounce: (t: number) => {
    const n = 7.5625;
    const d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t - 1.5 / d) ** 2 + 0.75;
    if (t < 2.5 / d) return n * (t - 2.25 / d) ** 2 + 0.9375;
    return n * (t - 2.625 / d) ** 2 + 0.984375;
  },
} satisfies Record<string, Easing>;

export interface Tween {
  readonly delay: number;
  readonly duration: number;
  readonly easing: Easing;
  /** Appelée à chaque image avec la progression lissée, de 0 à 1. */
  readonly update: (p: number) => void;
  readonly done?: () => void;
}

/** File d'animations en cours. */
export class Tweens {
  private items: { tween: Tween; start: number }[] = [];

  add(tween: Tween, now: number): void {
    this.items.push({ tween, start: now });
  }

  get active(): number {
    return this.items.length;
  }

  /** Fait avancer toutes les animations à l'instant `now` (ms). */
  tick(now: number): void {
    const remaining: typeof this.items = [];
    for (const item of this.items) {
      const t = (now - item.start - item.tween.delay) / item.tween.duration;
      if (t < 0) {
        remaining.push(item);
        continue;
      }
      const p = Math.min(1, t);
      item.tween.update(item.tween.easing(p));
      if (p < 1) remaining.push(item);
      else item.tween.done?.();
    }
    this.items = remaining;
  }

  /** Termine immédiatement toutes les animations (changement de profil, état redessiné). */
  finish(): void {
    for (const { tween } of this.items) {
      tween.update(1);
      tween.done?.();
    }
    this.items = [];
  }
}
