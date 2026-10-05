/**
 * Identifiants officiels (§4.1, §17.2) : les mods internes utilisent le préfixe `core:`.
 * Les noms et visuels définitifs viennent de la direction artistique (§14) ; les identifiants
 * restent stables.
 */
export const SHAPE = {
  square: 'core:square',
  triangle: 'core:triangle',
  heart: 'core:heart',
  circle: 'core:circle',
  star: 'core:star',
} as const;

export const CORE_SHAPES: readonly string[] = Object.values(SHAPE);

export const CORE_ENVS: readonly string[] = ['core:E0', 'core:E1', 'core:E2', 'core:E3', 'core:E4'];

/** Rôle d'une forme officielle : détermine le scorer de chaque tier (§9). */
export type ShapeRole = keyof typeof SHAPE;

export const OFFICIAL_TIERS = ['A', 'B', 'C', 'D'] as const;
export type OfficialTier = (typeof OFFICIAL_TIERS)[number];
