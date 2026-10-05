/**
 * Éclairage solaire selon l'heure **locale** (horloge du système, aucune géolocalisation, §14.4) :
 * aube, midi, crépuscule, nuit, avec des transitions lissées. Habillage saisonnier (§14.4) :
 * saison déduite de la date locale. Purement visuel.
 */

export interface Light {
  /** Direction de la lumière dans le plan de l'écran (radians, 0 = venant de l'est). */
  readonly angle: number;
  /** Hauteur du soleil, de 0 (horizon ou nuit) à 1 (zénith). */
  readonly elevation: number;
  /** Teinte multipliée sur le plateau (0xRRGGBB). */
  readonly tint: number;
  /** Intensité des reflets spéculaires, de 0 à 1. */
  readonly specular: number;
}

/** Points clés de la journée : heure (décimale) → teinte et intensité. */
const KEYS: readonly { hour: number; tint: number; specular: number }[] = [
  { hour: 0, tint: 0x5a6a9a, specular: 0.15 }, // nuit
  { hour: 5, tint: 0x6a6f9a, specular: 0.2 },
  { hour: 7, tint: 0xffc49a, specular: 0.55 }, // aube
  { hour: 12, tint: 0xffffff, specular: 1 }, // midi
  { hour: 18, tint: 0xffd7a8, specular: 0.7 },
  { hour: 20, tint: 0xd9897a, specular: 0.45 }, // crépuscule
  { hour: 22, tint: 0x5a6a9a, specular: 0.15 },
  { hour: 24, tint: 0x5a6a9a, specular: 0.15 },
];

function mixColor(a: number, b: number, t: number): number {
  const ch = (c: number, s: number) => (c >> s) & 0xff;
  const mix = (s: number) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t);
  return (mix(16) << 16) | (mix(8) << 8) | mix(0);
}

/** Lumière à l'heure locale `hours` (0 à 24, décimale). */
export function solarLight(hours: number): Light {
  const h = ((hours % 24) + 24) % 24;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1]!.hour <= h) i++;
  const a = KEYS[i]!;
  const b = KEYS[i + 1]!;
  // Interpolation lissée (smoothstep) entre deux points clés.
  const raw = (h - a.hour) / (b.hour - a.hour);
  const t = raw * raw * (3 - 2 * raw);
  // Le soleil se lève à l'est (6 h), culmine à midi, se couche à l'ouest (18 h).
  const day = Math.min(Math.max((h - 6) / 12, 0), 1);
  const up = h > 6 && h < 18;
  return {
    angle: Math.PI * (1 - day),
    elevation: up ? Math.sin(Math.PI * day) : 0,
    tint: mixColor(a.tint, b.tint, t),
    specular: a.specular + (b.specular - a.specular) * t,
  };
}

/** Éclairage zénithal fixe (profil Low). */
export const ZENITH: Light = { angle: Math.PI / 2, elevation: 1, tint: 0xffffff, specular: 0.6 };

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

/** Saison de la date locale (hémisphère nord, découpage par mois). */
export function seasonOf(date: Date): Season {
  const m = date.getMonth();
  if (m >= 2 && m <= 4) return 'spring';
  if (m >= 5 && m <= 7) return 'summer';
  if (m >= 8 && m <= 10) return 'autumn';
  return 'winter';
}

/** Heure locale décimale d'une date. */
export function localHours(date: Date): number {
  return date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
}
