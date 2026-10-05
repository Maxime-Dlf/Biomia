/**
 * Générateur pseudo-aléatoire déterministe à graine (§4.4, §15.1).
 * Algorithme sfc32 (32 bits, entiers uniquement), graine dérivée par cyrb128.
 * L'état est sérialisable en chaîne, ce qui permet de le stocker dans un `GameState` immuable.
 */

export interface Rng {
  /** Entier non signé sur 32 bits. */
  nextU32(): number;
  /** Entier uniforme dans `[0, n)`, sans biais. */
  int(n: number): number;
  /** Élément uniforme d'une liste non vide. */
  pick<T>(items: readonly T[]): T;
  /** Copie mélangée (Fisher-Yates). */
  shuffle<T>(items: readonly T[]): T[];
  /** État sérialisé, pour reprendre la séquence plus tard. */
  state(): string;
}

function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

class Sfc32 implements Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor([a, b, c, d]: readonly [number, number, number, number]) {
    this.a = a >>> 0;
    this.b = b >>> 0;
    this.c = c >>> 0;
    this.d = d >>> 0;
  }

  nextU32(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  int(n: number): number {
    if (!Number.isInteger(n) || n <= 0 || n > 0x1_0000_0000) {
      throw new RangeError(`Rng.int: borne invalide ${n}`);
    }
    // Rejet des valeurs du dernier intervalle incomplet : tirage strictement uniforme.
    const limit = 0x1_0000_0000 - (0x1_0000_0000 % n);
    let x = this.nextU32();
    while (x >= limit) x = this.nextU32();
    return x % n;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError('Rng.pick: liste vide');
    return items[this.int(items.length)]!;
  }

  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const tmp = out[i]!;
      out[i] = out[j]!;
      out[j] = tmp;
    }
    return out;
  }

  state(): string {
    return [this.a, this.b, this.c, this.d]
      .map((x) => (x >>> 0).toString(16).padStart(8, '0'))
      .join('.');
  }
}

/** RNG initialisé par une graine textuelle. Quelques tirages à vide brassent l'état initial. */
export function rngFromSeed(seed: string): Rng {
  const rng = new Sfc32(cyrb128(seed));
  for (let i = 0; i < 12; i++) rng.nextU32();
  return rng;
}

/** RNG repris depuis un état sérialisé par `Rng.state()`. */
export function rngFromState(state: string): Rng {
  const parts = state.split('.').map((p) => Number.parseInt(p, 16));
  if (parts.length !== 4 || parts.some((p) => !Number.isFinite(p))) {
    throw new Error(`État RNG invalide : ${state}`);
  }
  return new Sfc32(parts as [number, number, number, number]);
}

/**
 * RNG dérivé, indépendant de la séquence principale : sert aux choix aléatoires qui ne doivent
 * pas faire avancer l'état de la partie (ex. `autoPlay`, §6.10).
 */
export function deriveRng(state: string, salt: string): Rng {
  return rngFromSeed(`${state}|${salt}`);
}
