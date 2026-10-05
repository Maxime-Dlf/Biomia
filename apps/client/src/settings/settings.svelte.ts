/**
 * Paramètres globaux (§13.5) : valables partout (menus, tous les modes, hors-ligne), enregistrés par
 * appareil dans `localStorage`, avec repli en mémoire si le stockage est indisponible.
 */

import { setActiveTheme } from '../render/palette.ts';
import type { GraphicsProfile, RenderOptions } from '../render/performance.ts';
import { themeById } from '../render/theme.ts';

export type { GraphicsProfile };
export type Language = 'fr' | 'en';

export interface Settings {
  /** Profil de performance (§14.3), purement visuel. */
  profile: GraphicsProfile;
  /** Options individuelles réglées en plus du profil (§14.3). */
  graphics: Partial<RenderOptions>;
  /** Thème local (§14.6) : chaque joueur voit son skin, sans effet sur les autres. */
  theme: string;
  /** Échelle de rendu en % (Ultra Low : 50 / 75 / 100). */
  renderScale: 50 | 75 | 100;
  language: Language;
  /** Motifs de texture sur les couleurs d'environnement (§13.6). */
  patterns: boolean;
  highContrast: boolean;
  reducedMotion: boolean;
  /** Taille du texte de l'interface, en %. */
  textScale: number;
  volume: number;
}

const STORAGE_KEY = 'crassecadia.settings.v1';

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function browserLanguage(): Language {
  return typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('en')
    ? 'en'
    : 'fr';
}

export const DEFAULT_SETTINGS: Settings = {
  profile: 'normal',
  graphics: {},
  theme: 'default',
  renderScale: 100,
  language: browserLanguage(),
  patterns: true,
  highContrast: false,
  reducedMotion: prefersReducedMotion(),
  textScale: 100,
  volume: 80,
};

/** Stockage par appareil, avec repli en mémoire (iframe Discord, navigation privée…). */
const memory = new Map<string, string>();
const store = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return memory.get(key) ?? null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      memory.set(key, value);
    }
  },
};

function load(): Settings {
  const raw = store.get(STORAGE_KEY);
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export const settings: Settings = $state(load());

$effect.root(() => {
  $effect(() => {
    store.set(STORAGE_KEY, JSON.stringify(settings));
    document.documentElement.style.fontSize = `${settings.textScale}%`;
    document.documentElement.classList.toggle('high-contrast', settings.highContrast);
    document.documentElement.lang = settings.language;
    setActiveTheme(themeById(settings.theme));
  });
});
