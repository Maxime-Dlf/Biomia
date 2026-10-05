/**
 * Palette du thème actif (§14.6) : couleurs d'environnements (motifs d'accessibilité, §13.6) et de
 * camps. Les identifiants d'environnements restent stables ; les couleurs définitives viennent de la
 * direction artistique (§14.7).
 */
import { DEFAULT_THEME, type EnvStyle, type Pattern, type Theme } from './theme.ts';

export type { EnvStyle, Pattern };

let active: Theme = DEFAULT_THEME;

/** Thème appliqué au plateau et à l'interface (choisi dans les paramètres globaux). */
export function setActiveTheme(theme: Theme): void {
  active = theme;
}

export function activeTheme(): Theme {
  return active;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export const toCss = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** Style d'un environnement ; couleur dérivée de l'identifiant pour les environnements de mods. */
export function envStyle(env: string, theme: Theme = active): EnvStyle {
  const known = theme.envs[env];
  if (known) return { ...known, css: toCss(known.color) };
  const h = hash(env);
  const color =
    (((h >> 16) & 0x7f) + 0x60) * 0x10000 +
    (((h >> 8) & 0x7f) + 0x60) * 0x100 +
    ((h & 0x7f) + 0x60);
  const patterns: Pattern[] = ['dots', 'stripes', 'cross', 'waves', 'rings'];
  return { color, css: toCss(color), pattern: patterns[h % patterns.length]! };
}

/** Couleurs de camp (liserés, halos), contrastées entre elles et avec les environnements. */
export function campColor(index: number, theme: Theme = active): number {
  return theme.camps[index % theme.camps.length]!;
}

export function campCss(index: number): string {
  return toCss(campColor(index));
}

export const BOARD_BACKGROUND = DEFAULT_THEME.background;
