/**
 * Thèmes (§14.6) : paquets de données (palette, rendu des jetons, paramètres de shader,
 * particules saisonnières). Un thème est **local** : chaque joueur voit son skin, sans effet sur les
 * autres. Le format est celui d'un mod de type thème (§17) ; les thèmes de mods arriveront en
 * phase 10.
 */
import type { Season } from './lighting.ts';

export type Pattern = 'none' | 'dots' | 'stripes' | 'cross' | 'waves' | 'rings';

export interface EnvStyle {
  readonly color: number;
  readonly css: string;
  readonly pattern: Pattern;
}

export interface ParticleStyle {
  readonly colors: readonly number[];
  /** Vitesse verticale (px/s, négative = vers le haut). */
  readonly fall: number;
  readonly size: number;
  readonly shape: 'petal' | 'dot' | 'leaf' | 'flake';
}

export interface Theme {
  readonly id: string;
  readonly name: { readonly fr: string; readonly en: string };
  readonly background: number;
  /** Couleurs des environnements connus ; les autres sont dérivées de leur identifiant. */
  readonly envs: Readonly<Record<string, Omit<EnvStyle, 'css'>>>;
  readonly camps: readonly number[];
  readonly tokenFill: number;
  readonly outline: number;
  readonly highlight: number;
  readonly danger: number;
  /** Paramètres du shader « Pion de Luxe » (§14.4). */
  readonly shader: {
    readonly bevel: number;
    readonly specular: number;
    readonly shininess: number;
  };
  readonly particles: Readonly<Record<Season, ParticleStyle>>;
}

const SEASONS: Theme['particles'] = {
  spring: { colors: [0xffc3dc, 0xffe3ef], fall: 22, size: 4, shape: 'petal' },
  summer: { colors: [0xfff2a6, 0xffe066], fall: -10, size: 2, shape: 'dot' },
  autumn: { colors: [0xd9822b, 0xb5512a, 0xe0b04c], fall: 30, size: 5, shape: 'leaf' },
  winter: { colors: [0xffffff, 0xe6f2ff], fall: 18, size: 3, shape: 'flake' },
};

/** Thème par défaut : palette accessible Okabe-Ito (§13.6), couleurs provisoires (§14.7). */
export const DEFAULT_THEME: Theme = {
  id: 'default',
  name: { fr: 'Archipel (défaut)', en: 'Archipelago (default)' },
  background: 0x1d2621,
  envs: {
    'core:E0': { color: 0x009e73, pattern: 'dots' },
    'core:E1': { color: 0x56b4e9, pattern: 'waves' },
    'core:E2': { color: 0xe69f00, pattern: 'stripes' },
    'core:E3': { color: 0xf0e442, pattern: 'cross' },
    'core:E4': { color: 0xcc79a7, pattern: 'rings' },
  },
  camps: [
    0xd55e00, 0x0072b2, 0xffffff, 0x111111, 0xff66b3, 0x7fd13b, 0x9b59b6, 0xffd11a, 0x00c2c7,
    0x8c6d46, 0xff3b3b, 0x6c7ae0,
  ],
  tokenFill: 0xf7f3e8,
  outline: 0x10140f,
  highlight: 0xffffff,
  danger: 0xff4d4d,
  shader: { bevel: 2.5, specular: 0.55, shininess: 24 },
  particles: SEASONS,
};

/** Contraste élevé (§13.6) : couleurs franches, fond noir, contours appuyés. */
export const CONTRAST_THEME: Theme = {
  ...DEFAULT_THEME,
  id: 'contrast',
  name: { fr: 'Contraste élevé', en: 'High contrast' },
  background: 0x000000,
  envs: {
    'core:E0': { color: 0x00b050, pattern: 'dots' },
    'core:E1': { color: 0x2f8fff, pattern: 'waves' },
    'core:E2': { color: 0xff8c00, pattern: 'stripes' },
    'core:E3': { color: 0xffff00, pattern: 'cross' },
    'core:E4': { color: 0xff3fb4, pattern: 'rings' },
  },
  tokenFill: 0xffffff,
  outline: 0x000000,
  shader: { bevel: 2, specular: 0.35, shininess: 16 },
};

export const THEMES: readonly Theme[] = [DEFAULT_THEME, CONTRAST_THEME];

export function themeById(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? DEFAULT_THEME;
}
