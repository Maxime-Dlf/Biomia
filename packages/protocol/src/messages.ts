/**
 * Messages client ↔ serveur (§15.5, §23.2). Tout message du client est validé par un schéma Zod
 * strict (§18.2 : pas de champ inconnu, pas de prototype) ; le serveur fait confiance à ses propres
 * messages, décrits ici par des types.
 */
import type { Action, CampId, GameEvent, Replay, ScoreReport, SeatId } from '@crassecadia/engine';
import { z } from 'zod';
import { RoomCreationSchema } from './listing.ts';
import { RoomSettingsPatchSchema } from './settings.ts';

/** Version du protocole client ↔ serveur, échangée à la connexion (§15.5). */
export const PROTOCOL_VERSION = 2;

/** Nom du salon de jeu Colyseus. */
export const GAME_ROOM = 'game';

/* --------------------------------------------------------------- client → serveur */

const int = z.number().int();
/** Coordonnée de cellule : bornée pour rester un entier sûr. */
const coord = int.min(-1_000_000).max(1_000_000);
const seat = z.string().min(1).max(32);

/** Pseudo d'invité : 1 à 16 caractères, sans caractère de contrôle ni chevron (§18.2). */
export const PlayerNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(16)
  .regex(/^[^\p{C}<>]+$/u);

/** Jeton de reconnexion d'un siège : 32 octets aléatoires en base64url (§11.4). */
export const SeatTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

/** Actions qu'un client peut demander (§23.1). `closeObjectiveVote` est réservée au serveur. */
export const ActionSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('placeStartTile'),
    seat,
    q: coord,
    r: coord,
    orientation: int.min(0).max(5),
  }),
  z.strictObject({ type: z.literal('reroll'), seat }),
  z.strictObject({ type: z.literal('chooseTile'), seat, slot: int.min(0).max(98) }),
  z.strictObject({
    type: z.literal('placeTile'),
    seat,
    q: coord,
    r: coord,
    rotation: int.min(0).max(5),
  }),
  z.strictObject({ type: z.literal('chooseToken'), seat, slot: int.min(0).max(98).nullable() }),
  z.strictObject({ type: z.literal('placeToken'), seat, q: coord, r: coord }),
  z.strictObject({ type: z.literal('undo'), seat }),
  z.strictObject({ type: z.literal('confirm'), seat }),
  z.strictObject({ type: z.literal('requestObjectives'), seat }),
  z.strictObject({
    type: z.literal('voteObjective'),
    seat,
    cardId: z.string().min(1).max(64),
    keep: z.boolean(),
  }),
]);
export type ClientAction = z.infer<typeof ActionSchema>;

/**
 * `action` : `clientSeq` strictement croissant par siège (anti-rejeu) et `turnIndex` du tour visé
 * (liaison au tour) (§18.2).
 */
export const ActionMessageSchema = z.strictObject({
  clientSeq: int.min(1).max(2 ** 31 - 1),
  turnIndex: int.min(0),
  action: ActionSchema,
});
export type ActionMessage = z.infer<typeof ActionMessageSchema>;

/**
 * Options de connexion (message `hello` du §23.2, transmis à la création ou à la jonction du salon) :
 * version de protocole, plateforme, pseudo, jeton de reconnexion, mot de passe d'un salon protégé,
 * entrée en spectateur, et description du salon à sa création.
 */
export const JoinOptionsSchema = z.strictObject({
  protocol: int,
  platform: z.enum(['web', 'discord']),
  name: PlayerNameSchema,
  seatToken: SeatTokenSchema.optional(),
  password: z.string().max(64).optional(),
  spectator: z.boolean().optional(),
  /** Jeton d'accès Discord (Activity) : le serveur en tire le pseudo vérifié (§16.4). */
  discordToken: z.string().min(1).max(256).optional(),
  create: RoomCreationSchema.optional(),
  /** Salon d'une Activity Discord (§16.3), créé par le serveur. */
  discordInstance: z.string().min(1).max(64).optional(),
});
export type JoinOptions = z.infer<typeof JoinOptionsSchema>;

/** `start` : l'hôte lance la partie (§12.3). */
export const StartMessageSchema = z.strictObject({});

/** Droits de l'hôte (§12.3) : configurer, expulser, verrouiller, transférer l'hôte. */
export const SettingsMessageSchema = z.strictObject({ patch: RoomSettingsPatchSchema });
export const KickMessageSchema = z.strictObject({ seat });
export const LockMessageSchema = z.strictObject({ locked: z.boolean() });
export const TransferHostMessageSchema = z.strictObject({ seat });
/** Préréglages du §12.4 appliqués par l'hôte (les champs propres au salon sont conservés). */
export const PresetMessageSchema = z.strictObject({
  preset: z.enum(['official', 'initiation', 'chaos']),
});
/** Composition libre des équipes (§11.1) : l'hôte place n'importe quel siège, un joueur le sien. */
export const TeamMessageSchema = z.strictObject({ seat, team: int.min(0).max(998) });

/* --------------------------------------------------------------- serveur → client */

/**
 * Codes d'erreur à la connexion (`ServerError`). Colyseus les utilise aussi comme statut HTTP de la
 * réponse de matchmaking : ce sont donc des statuts HTTP valides.
 */
export const JoinError = {
  invalidOptions: 400,
  wrongPassword: 401,
  discordAuth: 402,
  invalidSeatToken: 403,
  spectatorsDisabled: 405,
  gameInProgress: 409,
  overBudget: 413,
  full: 423,
  protocolMismatch: 426,
  tooManyAttempts: 429,
  locked: 451,
} as const;

/** Chat (§11.2) : 300 caractères au plus, sans caractère de contrôle. */
export const CHAT_MAX_LENGTH = 300;
export const ChatMessageSchema = z.strictObject({
  text: z
    .string()
    .trim()
    .min(1)
    .max(CHAT_MAX_LENGTH)
    .regex(/^[^\p{Cc}]+$/u),
  /** `team` : chat d'équipe (général en individuel) ; `all` : chat général. */
  scope: z.enum(['team', 'all']),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

/** Ligne de chat diffusée (texte brut, échappé à l'affichage, §18.2). */
export interface ChatLine {
  readonly id: number;
  readonly seat: SeatId;
  readonly name: string;
  /** Envoyée au seul camp de l'auteur. */
  readonly team: boolean;
  readonly text: string;
}

/** API HTTP (§16.2 : mapping `/api`) : en-tête obligatoire contre le CSRF (§18.2). */
export const API_HEADER = 'x-crassecadia';

export const DiscordTokenRequestSchema = z.strictObject({ code: z.string().min(1).max(256) });
export const DiscordRoomRequestSchema = z.strictObject({
  instanceId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
});

export interface DiscordTokenResponse {
  readonly access_token: string;
}

export interface DiscordRoomResponse {
  readonly roomId: string;
}

/** Code de fermeture de la connexion d'un joueur expulsé par l'hôte (§12.3). */
export const CLOSE_KICKED = 4100;

/** Envoyé à chaque connexion : siège attribué et jeton de reconnexion. */
export interface WelcomeMessage {
  readonly protocol: number;
  readonly roomId: string;
  readonly seat: SeatId;
  readonly seatToken: string;
  /** Horloge du serveur (ms), pour convertir l'échéance du minuteur. */
  readonly serverTime: number;
  /** Dernier `clientSeq` traité pour ce siège. */
  readonly lastClientSeq: number;
  /** Spectateur : pas de siège, informations publiques uniquement (§12.3). */
  readonly spectator: boolean;
}

export interface ActionRejectedMessage {
  readonly clientSeq: number | null;
  readonly reason: string;
}

/** Événements d'une action, filtrés pour le destinataire (§15.4 : `ObjectiveStatusChanged` est privé). */
export interface EventsMessage {
  readonly events: readonly GameEvent[];
}

/** `ScoreReport` officiel, calculé par le serveur (§15.5). */
export interface ScoreReportMessage {
  readonly report: ScoreReport;
}

export interface GameOverMessage {
  readonly report: ScoreReport;
  /** Classement final (§11.3), groupes de camps à égalité. */
  readonly ranking: readonly (readonly CampId[])[];
  /** Replay : configuration + graine + actions (§15.4), révélé en fin de partie. */
  readonly replay: Replay;
}

/** Une action envoyée par un client, telle que le serveur la reçoit. */
export type RequestedAction = Exclude<Action, { type: 'closeObjectiveVote' }>;
