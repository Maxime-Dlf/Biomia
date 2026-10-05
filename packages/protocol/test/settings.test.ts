import { describe, expect, it } from 'vitest';
import {
  filterRooms,
  type ListedRoom,
  type RoomListing,
  type RoomSettings,
  RoomSettingsSchema,
  settingsTileCount,
  settingsToConfig,
} from '../src/index.ts';

const SHAPES = ['s1', 's2', 's3', 's4', 's5'];
const ENVS = ['e1', 'e2', 'e3', 'e4', 'e5'];

const BASE: RoomSettings = {
  seats: 4,
  bots: 1,
  botLevel: 'easy',
  teams: { mode: 'none', count: 2 },
  rounds: 20,
  turnTimerSeconds: 45,
  turnOrder: 'seats',
  marketSize: 4,
  startJokers: 0,
  tierByShape: Object.fromEntries(SHAPES.map((s) => [s, 'D'])),
  activeShapes: SHAPES,
  activeEnvs: ENVS,
  capacityRatio: [1, 2, 2],
  thresholdDivisor: 10,
  steals: true,
  sabotage: true,
  autoReroll: true,
  manualReroll: true,
  monoBonus: 1,
  objectives: {
    enabled: true,
    initialHigh: 1,
    initialLow: 2,
    broken: 'return-fixed-penalty',
    brokenPenalty: 2,
  },
  undo: true,
  structureVisibility: 'own',
  scoreVisibility: 'live',
  spectators: false,
  joinInProgress: false,
};

const valid = (s: unknown) => RoomSettingsSchema.safeParse(s).success;

describe('§12.4 paramètres du mode custom', () => {
  it('accepte les valeurs par défaut et les bornes « libres »', () => {
    expect(valid(BASE)).toBe(true);
    expect(valid({ ...BASE, seats: 999, bots: 999, rounds: 999, marketSize: 99 })).toBe(true);
    expect(valid({ ...BASE, turnTimerSeconds: null })).toBe(true);
    expect(valid({ ...BASE, capacityRatio: [0, 0, 5] })).toBe(true);
  });

  it('refuse les valeurs hors bornes et les incohérences', () => {
    const bad: unknown[] = [
      { ...BASE, seats: 0 },
      { ...BASE, seats: 1000 },
      { ...BASE, bots: 5 },
      { ...BASE, rounds: 0 },
      { ...BASE, turnTimerSeconds: 4 },
      { ...BASE, turnTimerSeconds: 3601 },
      { ...BASE, marketSize: 100 },
      { ...BASE, activeShapes: ['s1'] },
      { ...BASE, activeEnvs: ['e1', 'e1'] },
      { ...BASE, tierByShape: { s1: 'D' } },
      { ...BASE, capacityRatio: [0, 0, 0] },
      { ...BASE, monoBonus: 100 },
      { ...BASE, objectives: { ...BASE.objectives, initialHigh: 0, initialLow: 0 } },
      { ...BASE, teams: { mode: 'manual', count: 5 } },
      { ...BASE, unknown: 1 },
    ];
    for (const s of bad) expect(valid(s)).toBe(false);
  });

  it('se traduit en GameConfig custom ; le budget compte les tuiles du §4.3', () => {
    const seats = [0, 1, 2, 3].map((i) => ({ id: `p${i}`, name: '', bot: null }));
    const config = settingsToConfig({ ...BASE, monoBonus: 3, turnTimerSeconds: null }, seats, null);
    expect(config).toMatchObject({ mode: 'custom', turnTimerMs: null, rounds: 20, mods: [] });
    expect(config.options.monoBonus).toBe(3);
    // T = manches × sièges + m (individuel) ; équipes : taille max × nb × manches + m.
    expect(settingsTileCount(BASE)).toBe(20 * 4 + 4);
    expect(settingsTileCount({ ...BASE, seats: 5, teams: { mode: 'manual', count: 2 } })).toBe(
      3 * 2 * 20 + 4,
    );
  });
});

const listing = (over: Partial<RoomListing>): RoomListing => ({
  name: 'Salon',
  host: 'Ana',
  humans: 1,
  maxHumans: 4,
  bots: 0,
  stage: 'lobby',
  tiers: ['D'],
  mods: [],
  rounds: 20,
  timer: 45,
  language: 'fr',
  region: 'eu',
  protected: false,
  locked: false,
  spectators: false,
  joinInProgress: false,
  freeSeats: 3,
  ...over,
});

describe('§12.3 navigateur de salons', () => {
  const rooms: ListedRoom[] = [
    { roomId: 'AAAAAA', createdAt: 1, metadata: listing({ name: 'Crasses à gogo' }) },
    {
      roomId: 'BBBBBB',
      createdAt: 2,
      metadata: listing({ name: 'Tier A', tiers: ['A'], humans: 3 }),
    },
    {
      roomId: 'CCCCCC',
      createdAt: 3,
      metadata: listing({ name: 'Full', freeSeats: 0, language: 'en' }),
    },
    {
      roomId: 'DDDDDD',
      createdAt: 4,
      metadata: listing({
        name: 'Moddé',
        stage: 'playing',
        mods: [{ id: 'm', scripts: true, shaders: false }],
      }),
    },
    { roomId: 'EEEEEE', createdAt: 5 },
  ];
  const ids = (q: Parameters<typeof filterRooms>[1]) => filterRooms(rooms, q).map((r) => r.roomId);

  it('recherche sans accents ni casse, sur le nom, l’hôte et le code', () => {
    expect(ids({ search: 'CRASSES A' })).toEqual(['AAAAAA']);
    expect(ids({ search: 'bbbb' })).toEqual(['BBBBBB']);
    expect(ids({ search: 'ana', sort: 'name' })).toEqual(['AAAAAA', 'CCCCCC', 'DDDDDD', 'BBBBBB']);
  });

  it('filtre places libres, sans mods, langue, tier et état ; trie', () => {
    expect(ids({ freeSeats: true })).toEqual(['DDDDDD', 'BBBBBB', 'AAAAAA']);
    expect(ids({ noMods: true })).toEqual(['CCCCCC', 'BBBBBB', 'AAAAAA']);
    expect(ids({ language: 'en' })).toEqual(['CCCCCC']);
    expect(ids({ tier: 'A' })).toEqual(['BBBBBB']);
    expect(ids({ stage: 'playing' })).toEqual(['DDDDDD']);
    expect(ids({ sort: 'players' })[0]).toBe('BBBBBB');
  });
});
