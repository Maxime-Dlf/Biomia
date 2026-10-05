/**
 * Paramètres d'un salon personnalisé (§12.4) : schéma Zod, conversion vers la `GameConfig` du moteur
 * et depuis une configuration (préréglages du paquet `content`).
 *
 * Les bornes « libres » du §12.4 sont des limites techniques, pas des limites de jeu.
 */
import {
  type BotLevel,
  computeTileCount,
  type GameConfig,
  type SeatConfig,
  type TeamConfig,
} from '@crassecadia/engine';
import { z } from 'zod';

const int = z.number().int();
const id = z.string().min(1).max(64);

export const BOT_LEVELS = ['easy', 'medium', 'cunning'] as const satisfies readonly BotLevel[];

/** Champs des paramètres du salon (§12.4), chacun avec ses bornes. */
const RoomSettingsShape = z.strictObject({
  /** Sièges, humains et bots compris. */
  seats: int.min(1).max(999),
  bots: int.min(0).max(999),
  botLevel: z.enum(BOT_LEVELS),
  /** `none` : chacun pour soi ; `manual` : composition libre ; `random` : répartition aléatoire. */
  teams: z.strictObject({
    mode: z.enum(['none', 'manual', 'random']),
    count: int.min(2).max(999),
  }),
  rounds: int.min(1).max(999),
  /** `null` = sans minuteur. */
  turnTimerSeconds: int.min(5).max(3600).nullable(),
  turnOrder: z.enum(['seats', 'random']),
  marketSize: int.min(1).max(99),
  startJokers: int.min(0).max(999),
  tierByShape: z.record(id, id),
  activeShapes: z.array(id).min(2).max(64),
  activeEnvs: z.array(id).min(2).max(64),
  /** Ratio des capacités 1:2:3 (§4.4). */
  capacityRatio: z.tuple([int.min(0).max(99), int.min(0).max(99), int.min(0).max(99)]),
  /** Coefficient du seuil `⌈(T − m) / d⌉` (§8.2). */
  thresholdDivisor: int.min(1).max(1000),
  steals: z.boolean(),
  sabotage: z.boolean(),
  autoReroll: z.boolean(),
  manualReroll: z.boolean(),
  /** Jokers du bonus monochrome (§6.6) ; 0 = désactivé. */
  monoBonus: int.min(0).max(99),
  objectives: z.strictObject({
    enabled: z.boolean(),
    initialHigh: int.min(0).max(10),
    initialLow: int.min(0).max(10),
    broken: z.enum(['return-fixed-penalty', 'return-value', 'lost-zero', 'to-saboteur', 'locked']),
    brokenPenalty: int.min(0).max(99),
  }),
  undo: z.boolean(),
  structureVisibility: z.enum(['own', 'all']),
  scoreVisibility: z.enum(['live', 'hidden']),
  spectators: z.boolean(),
  joinInProgress: z.boolean(),
});

/**
 * Modification partielle envoyée par l'hôte : le serveur la fusionne avec ses paramètres courants,
 * ce qui évite qu'une modification rapide en écrase une autre encore en vol.
 */
export const RoomSettingsPatchSchema = RoomSettingsShape.partial();
export type RoomSettingsPatch = z.infer<typeof RoomSettingsPatchSchema>;

/** Paramètres de jeu du salon, modifiables par l'hôte en salle d'attente (§12.4). */
export const RoomSettingsSchema = RoomSettingsShape.refine((s) => s.bots <= s.seats, {
  message: 'plus de bots que de sièges',
})
  .refine((s) => new Set(s.activeShapes).size === s.activeShapes.length, {
    message: 'formes en double',
  })
  .refine((s) => new Set(s.activeEnvs).size === s.activeEnvs.length, {
    message: 'environnements en double',
  })
  .refine((s) => s.activeShapes.every((shape) => s.tierByShape[shape] !== undefined), {
    message: 'chaque forme active a un tier',
  })
  .refine((s) => s.capacityRatio.some((w) => w > 0), { message: 'ratio des capacités nul' })
  .refine((s) => !s.objectives.enabled || s.objectives.initialHigh + s.objectives.initialLow > 0, {
    message: 'au moins un objectif au tirage',
  })
  .refine((s) => s.teams.mode === 'none' || s.teams.count <= s.seats, {
    message: 'plus d’équipes que de sièges',
  });
export type RoomSettings = z.infer<typeof RoomSettingsSchema>;

/** Nombre maximal de joueurs humains : les sièges qui ne sont pas des bots. */
export function humanSeats(settings: RoomSettings): number {
  return settings.seats - settings.bots;
}

/** Paramètres repris d'une configuration (préréglage, §12.4) ; les champs du salon sont conservés. */
export function settingsFromConfig(
  config: GameConfig,
  room: Pick<
    RoomSettings,
    'seats' | 'bots' | 'botLevel' | 'teams' | 'spectators' | 'joinInProgress'
  >,
): RoomSettings {
  const o = config.options;
  return {
    ...room,
    rounds: config.rounds,
    turnTimerSeconds: config.turnTimerMs === null ? null : Math.round(config.turnTimerMs / 1000),
    turnOrder: o.turnOrder,
    marketSize: config.marketSize,
    startJokers: config.startJokers,
    tierByShape: { ...config.tierByShape },
    activeShapes: [...config.activeShapes],
    activeEnvs: [...config.activeEnvs],
    capacityRatio: [o.capacityRatio[0] ?? 0, o.capacityRatio[1] ?? 0, o.capacityRatio[2] ?? 0],
    thresholdDivisor: o.thresholdDivisor,
    steals: o.steals,
    sabotage: o.sabotage,
    autoReroll: o.autoReroll,
    manualReroll: o.manualReroll,
    monoBonus: o.monoBonus,
    objectives: { ...o.objectives },
    undo: o.undo,
    structureVisibility: o.structureVisibility,
    scoreVisibility: o.scoreVisibility,
  };
}

/** `GameConfig` du mode custom (§12.4) pour ces sièges et ces équipes. */
export function settingsToConfig(
  settings: RoomSettings,
  seats: readonly SeatConfig[],
  teams: readonly TeamConfig[] | null,
): GameConfig {
  const s = settings;
  return {
    mode: 'custom',
    seats,
    teams,
    rounds: s.rounds,
    turnTimerMs: s.turnTimerSeconds === null ? null : s.turnTimerSeconds * 1000,
    marketSize: s.marketSize,
    startJokers: s.startJokers,
    tierByShape: Object.fromEntries(s.activeShapes.map((shape) => [shape, s.tierByShape[shape]!])),
    activeShapes: s.activeShapes,
    activeEnvs: s.activeEnvs,
    options: {
      steals: s.steals,
      sabotage: s.sabotage,
      autoReroll: s.autoReroll,
      manualReroll: s.manualReroll,
      monoBonus: s.monoBonus,
      undo: s.undo,
      turnOrder: s.turnOrder,
      capacityRatio: s.capacityRatio,
      thresholdDivisor: s.thresholdDivisor,
      objectives: s.objectives,
      structureVisibility: s.structureVisibility,
      scoreVisibility: s.scoreVisibility,
    },
    mods: [],
  };
}

/**
 * Nombre de tuiles d'une partie avec ces paramètres (§4.3), tous les sièges occupés : sert au
 * budget du salon et à l'avertissement de performance (§12.4).
 */
export function settingsTileCount(settings: RoomSettings): number {
  const seats: SeatConfig[] = Array.from({ length: settings.seats }, (_, i) => ({
    id: `s${i}`,
    name: '',
    bot: null,
  }));
  let teams: TeamConfig[] | null = null;
  if (settings.teams.mode !== 'none') {
    const count = Math.min(settings.teams.count, seats.length);
    teams = Array.from({ length: count }, (_, t) => ({
      id: `t${t}`,
      name: '',
      seats: seats.filter((_, i) => i % count === t).map((x) => x.id),
    }));
  }
  return computeTileCount(settingsToConfig(settings, seats, teams));
}

/** Budget de tuiles par salon par défaut (§12.4 : limite d'hébergement, réglable par l'exploitant). */
export const DEFAULT_TILE_BUDGET = 200_000;

/** Au-delà, l'interface affiche un avertissement de performance (§12.4). */
export const PERFORMANCE_WARNING_TILES = 20_000;
