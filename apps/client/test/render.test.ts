import { describe, expect, it } from 'vitest';
import { localHours, seasonOf, solarLight, ZENITH } from '../src/render/lighting.ts';
import {
  FpsMonitor,
  lighterProfile,
  PROFILE_OPTIONS,
  resolveRenderOptions,
} from '../src/render/performance.ts';
import { ease, Tweens } from '../src/render/tween.ts';

describe('§14.3 profils de performance', () => {
  it('Ultra Low : aucun shader, aucune animation, textures SD ; Normal : 2.5D complet', () => {
    expect(PROFILE_OPTIONS['ultra-low']).toMatchObject({
      tokenShader: 'none',
      lighting: 'none',
      animations: 'none',
      particles: false,
      textures: 'sd',
      bevel: false,
    });
    expect(PROFILE_OPTIONS.normal).toMatchObject({
      tokenShader: 'luxe',
      lighting: 'solar',
      animations: 'full',
      particles: true,
      shadows: true,
    });
    expect(PROFILE_OPTIONS.low).toMatchObject({
      tokenShader: 'simple',
      lighting: 'zenith',
      particles: false,
      animations: 'light',
    });
  });

  it('options individuelles en plus du profil ; animations réduites (§13.6)', () => {
    expect(resolveRenderOptions('ultra-low', { bevel: true }, false).bevel).toBe(true);
    expect(resolveRenderOptions('normal', {}, true)).toMatchObject({
      animations: 'none',
      particles: false,
      tokenShader: 'luxe',
    });
    expect(lighterProfile('normal')).toBe('low');
    expect(lighterProfile('ultra-low')).toBeNull();
  });

  it('suggère un profil plus léger sous 45 FPS pendant 5 s, une seule fois', () => {
    let slow = 0;
    const monitor = new FpsMonitor(() => slow++);
    let t = 0;
    for (; t < 4000; t += 33) monitor.frame(t); // 30 FPS pendant 4 s
    expect(slow).toBe(0);
    for (; t < 7000; t += 33) monitor.frame(t);
    expect(slow).toBe(1);
    for (; t < 20000; t += 33) monitor.frame(t);
    expect(slow).toBe(1);
    monitor.reset();
    let fast = 0;
    const smooth = new FpsMonitor(() => fast++);
    for (let u = 0; u < 20000; u += 16) smooth.frame(u); // 60 FPS
    expect(fast).toBe(0);
  });
});

describe('§14.4 éclairage solaire selon l’heure locale', () => {
  it('midi : lumière blanche au zénith ; nuit : bleutée, sans soleil ; transitions lissées', () => {
    expect(solarLight(12)).toMatchObject({ tint: 0xffffff, elevation: 1 });
    expect(solarLight(12).angle).toBeCloseTo(Math.PI / 2);
    const night = solarLight(2);
    expect(night.elevation).toBe(0);
    expect(night.tint & 0xff).toBeGreaterThan((night.tint >> 16) & 0xff); // bleutée
    // Le soleil se lève à l'est et se couche à l'ouest.
    expect(solarLight(8).angle).toBeGreaterThan(solarLight(16).angle);
    // Continuité : pas de saut de teinte entre deux minutes.
    const a = solarLight(6.99).tint;
    const b = solarLight(7.01).tint;
    const diff = (c: number, d: number, s: number) =>
      Math.abs(((c >> s) & 0xff) - ((d >> s) & 0xff));
    expect(Math.max(diff(a, b, 16), diff(a, b, 8), diff(a, b, 0))).toBeLessThan(6);
    expect(ZENITH.elevation).toBe(1);
  });

  it('heure et saison de la date locale', () => {
    expect(localHours(new Date(2026, 9, 3, 18, 30))).toBeCloseTo(18.5);
    expect(seasonOf(new Date(2026, 3, 1))).toBe('spring');
    expect(seasonOf(new Date(2026, 6, 1))).toBe('summer');
    expect(seasonOf(new Date(2026, 9, 3))).toBe('autumn');
    expect(seasonOf(new Date(2026, 0, 15))).toBe('winter');
  });
});

describe('§14.5 interpolations', () => {
  it('progression lissée, délai, fin et arrêt immédiat', () => {
    const seen: number[] = [];
    let done = 0;
    const tweens = new Tweens();
    tweens.add(
      {
        delay: 100,
        duration: 200,
        easing: ease.linear,
        update: (p) => seen.push(p),
        done: () => done++,
      },
      0,
    );
    tweens.tick(50);
    expect(seen).toEqual([]);
    tweens.tick(200);
    expect(seen.at(-1)).toBeCloseTo(0.5);
    tweens.tick(400);
    expect(seen.at(-1)).toBe(1);
    expect(done).toBe(1);
    expect(tweens.active).toBe(0);
    tweens.add(
      { delay: 0, duration: 1000, easing: ease.outBounce, update: (p) => seen.push(p) },
      0,
    );
    tweens.finish();
    expect(seen.at(-1)).toBe(1);
    expect(ease.outBounce(1)).toBeCloseTo(1);
  });
});

describe('§14.5 sons pilotés par les événements', () => {
  it('un son par type d’événement, « à vous » seulement pour ses sièges', async () => {
    const { soundsFor } = await import('../src/audio/SoundEngine.ts');
    const mine = (seat: string) => seat === 'me';
    expect(
      soundsFor(
        [
          { type: 'TurnStarted', seat: 'me', turnIndex: 1, round: 1 },
          { type: 'JokerGained', camp: 'me', amount: 1, reason: 'monochrome' },
          { type: 'GameEnded' },
        ],
        mine,
      ),
    ).toEqual(['your-turn', 'joker', 'game-over']);
    expect(
      soundsFor([{ type: 'TurnStarted', seat: 'other', turnIndex: 1, round: 1 }], mine),
    ).toEqual([]);
  });
});
