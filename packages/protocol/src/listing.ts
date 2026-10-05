/**
 * Navigateur de salons (§12.3) : fiche publique d'un salon (métadonnées Colyseus), recherche,
 * filtres et tri. Les salons privés ne sont jamais listés.
 */
import { z } from 'zod';

export type RoomVisibility = 'public' | 'protected' | 'private';
export type RoomStage = 'lobby' | 'playing' | 'ended';

/** Nom de la salle Colyseus du navigateur (`LobbyRoom`). */
export const LOBBY_ROOM = 'lobby';

/** Création d'un salon : nom, visibilité, mot de passe (salon protégé), langue (§12.3). */
export const RoomCreationSchema = z
  .strictObject({
    name: z
      .string()
      .trim()
      .min(1)
      .max(32)
      .regex(/^[^\p{C}<>]+$/u),
    visibility: z.enum(['public', 'protected', 'private']),
    password: z.string().min(4).max(64).optional(),
    language: z.string().regex(/^[a-z]{2}$/),
  })
  .refine((c) => c.visibility !== 'protected' || c.password !== undefined, {
    message: 'mot de passe requis pour un salon protégé',
  });
export type RoomCreation = z.infer<typeof RoomCreationSchema>;

/** Colonnes du navigateur (§12.3), publiées dans les métadonnées du salon. */
export interface RoomListing {
  readonly name: string;
  readonly host: string;
  readonly humans: number;
  /** Places humaines (sièges − bots). */
  readonly maxHumans: number;
  readonly bots: number;
  readonly stage: RoomStage;
  /** Tiers utilisés, sans doublon (ex. `['D']`, `['A', 'C']`). */
  readonly tiers: readonly string[];
  readonly mods: readonly {
    readonly id: string;
    readonly scripts: boolean;
    readonly shaders: boolean;
  }[];
  readonly rounds: number;
  /** Minuteur en secondes, `null` sans minuteur. */
  readonly timer: number | null;
  readonly language: string;
  readonly region: string;
  /** Salon protégé par mot de passe. */
  readonly protected: boolean;
  /** Verrouillé par l'hôte : plus aucune nouvelle arrivée. */
  readonly locked: boolean;
  readonly spectators: boolean;
  readonly joinInProgress: boolean;
  /** Sièges qu'un nouveau venu peut prendre (salle d'attente, ou partie avec « rejoindre en cours »). */
  readonly freeSeats: number;
}

/** Salon tel que reçu de la `LobbyRoom`. */
export interface ListedRoom {
  readonly roomId: string;
  readonly createdAt?: string | number | Date;
  readonly metadata?: RoomListing;
}

export interface RoomQuery {
  readonly search?: string;
  /** Seulement les salons avec une place libre. */
  readonly freeSeats?: boolean;
  readonly noMods?: boolean;
  readonly language?: string | null;
  readonly tier?: string | null;
  readonly stage?: RoomStage | null;
  readonly sort?: 'name' | 'players' | 'newest';
}

const normalize = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Recherche, filtres et tri du navigateur (§12.3). */
export function filterRooms(rooms: readonly ListedRoom[], query: RoomQuery): ListedRoom[] {
  const search = normalize(query.search?.trim() ?? '');
  const out = rooms.filter((r): r is ListedRoom & { metadata: RoomListing } => {
    const m = r.metadata;
    if (!m) return false;
    if (search && !normalize(`${m.name} ${m.host} ${r.roomId}`).includes(search)) return false;
    if (query.freeSeats && (m.freeSeats <= 0 || m.locked)) return false;
    if (query.noMods && m.mods.length > 0) return false;
    if (query.language && m.language !== query.language) return false;
    if (query.tier && !m.tiers.includes(query.tier)) return false;
    if (query.stage && m.stage !== query.stage) return false;
    return true;
  });
  const time = (r: ListedRoom) => new Date(r.createdAt ?? 0).getTime();
  switch (query.sort ?? 'newest') {
    case 'name':
      out.sort((a, b) => a.metadata.name.localeCompare(b.metadata.name));
      break;
    case 'players':
      out.sort((a, b) => b.metadata.humans - a.metadata.humans || time(b) - time(a));
      break;
    case 'newest':
      out.sort((a, b) => time(b) - time(a));
      break;
  }
  return out;
}
