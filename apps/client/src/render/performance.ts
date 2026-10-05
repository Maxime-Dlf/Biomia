/**
 * `PerformanceManager` (§14.3) : options de rendu d'un profil, options individuelles réglables en
 * plus, et suggestion d'un profil plus léger quand le jeu tourne sous 45 FPS pendant 5 s.
 * Les profils sont purement visuels : aucune influence sur les règles, l'état ou le timing.
 */

export type GraphicsProfile = 'normal' | 'low' | 'ultra-low';

export interface RenderOptions {
  /** Tuiles 2.5D : biseau procédural. */
  readonly bevel: boolean;
  /** Ombre portée et ombre de contact entre tuiles. */
  readonly shadows: boolean;
  /** Frontière des bicolores en courbe organique (sinon droite). */
  readonly organicBorders: boolean;
  /** Entrelacement cyclique des 3 icônes d'accueil (§14.4). */
  readonly interlacedIcons: boolean;
  /** Shader de pion : « Pion de Luxe » complet, simplifié en une passe, ou aucun. */
  readonly tokenShader: 'luxe' | 'simple' | 'none';
  /** Éclairage solaire selon l'heure locale, zénithal fixe, ou aucun (2D plat). */
  readonly lighting: 'solar' | 'zenith' | 'none';
  readonly particles: boolean;
  readonly animations: 'full' | 'light' | 'none';
  /** Textures HD (512 / 256 px) ou SD (256 / 128 px). */
  readonly textures: 'hd' | 'sd';
}

export const PROFILE_OPTIONS: Readonly<Record<GraphicsProfile, RenderOptions>> = {
  normal: {
    bevel: true,
    shadows: true,
    organicBorders: true,
    interlacedIcons: true,
    tokenShader: 'luxe',
    lighting: 'solar',
    particles: true,
    animations: 'full',
    textures: 'hd',
  },
  low: {
    bevel: true,
    shadows: false,
    organicBorders: true,
    interlacedIcons: true,
    tokenShader: 'simple',
    lighting: 'zenith',
    particles: false,
    animations: 'light',
    textures: 'hd',
  },
  'ultra-low': {
    bevel: false,
    shadows: false,
    organicBorders: false,
    interlacedIcons: false,
    tokenShader: 'none',
    lighting: 'none',
    particles: false,
    animations: 'none',
    textures: 'sd',
  },
};

/**
 * Options effectives : celles du profil, remplacées par les options individuelles, et sans
 * animation quand « animations réduites » est actif (§13.6).
 */
export function resolveRenderOptions(
  profile: GraphicsProfile,
  overrides: Partial<RenderOptions>,
  reducedMotion: boolean,
): RenderOptions {
  const options = { ...PROFILE_OPTIONS[profile], ...overrides };
  return reducedMotion ? { ...options, animations: 'none', particles: false } : options;
}

/** Profil plus léger que suggérer, `null` s'il n'y en a pas. */
export function lighterProfile(profile: GraphicsProfile): GraphicsProfile | null {
  return profile === 'normal' ? 'low' : profile === 'low' ? 'ultra-low' : null;
}

/**
 * Surveillance des FPS **[PROPOSITION]** : `onSlow` est appelé une fois si la moyenne glissante reste
 * sous `threshold` pendant `durationMs`. Le temps est fourni par l'appelant (testable).
 */
export class FpsMonitor {
  private slowSince: number | null = null;
  private frames: number[] = [];
  private fired = false;

  constructor(
    private readonly onSlow: () => void,
    private readonly threshold = 45,
    private readonly durationMs = 5000,
  ) {}

  /** Enregistre une image affichée à l'instant `now` (ms). */
  frame(now: number): void {
    this.frames.push(now);
    while (this.frames.length > 0 && now - this.frames[0]! > 1000) this.frames.shift();
    if (this.fired || this.frames.length < 2) return;
    const span = now - this.frames[0]!;
    if (span < 900) return;
    const fps = ((this.frames.length - 1) * 1000) / span;
    if (fps >= this.threshold) {
      this.slowSince = null;
      return;
    }
    this.slowSince ??= now;
    if (now - this.slowSince >= this.durationMs) {
      this.fired = true;
      this.onSlow();
    }
  }

  /** Après un changement de profil : on recommence à observer. */
  reset(): void {
    this.slowSince = null;
    this.frames = [];
    this.fired = false;
  }
}
