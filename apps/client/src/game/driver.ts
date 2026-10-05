/**
 * Pilote de partie : interface commune au pilote local (hors-ligne, phase 4) et au pilote réseau
 * (phase 5). L'interface ne voit qu'un `GameState` du moteur, reconstruit côté réseau à partir de la
 * projection du serveur (§15.5).
 */
import type {
  Action,
  GameEvent,
  GameState,
  Replay,
  ScoreReport,
  SeatId,
} from '@crassecadia/engine';

/** État de la connexion au serveur (pilote réseau uniquement). */
export type ConnectionStatus = 'online' | 'reconnecting' | 'closed';

export interface DriverUpdate {
  readonly state: GameState;
  /** Événements produits depuis la mise à jour précédente (animations, journal). */
  readonly events: readonly GameEvent[];
  /** Échéance du minuteur en cours (ms, horloge locale), `null` sans minuteur. */
  readonly deadline: number | null;
  /** `ScoreReport` officiel du serveur (§15.5) ; absent en local, où il est calculé sur place. */
  readonly report?: ScoreReport | null;
  /** Motif d'un refus reçu après coup du serveur. */
  readonly rejected?: string | null;
  readonly connection?: ConnectionStatus;
}

export type SendResult = { readonly ok: true } | { readonly ok: false; readonly reason: string };

export interface GameDriver {
  /** Sièges joués sur cet appareil (plusieurs en partie à plusieurs sur un écran). */
  readonly localSeats: readonly SeatId[];
  /** Partie à plusieurs sur un même écran : les objectifs sont masqués entre deux sièges (U2). */
  readonly sharedScreen: boolean;
  /** Spectateur : aucun siège joué sur cet appareil (§12.3). */
  readonly spectator: boolean;
  readonly current: DriverUpdate;
  subscribe(listener: (update: DriverUpdate) => void): () => void;
  send(action: Action): SendResult;
  /** Replay de la partie (§15.4), quand il est disponible. */
  replay(): Replay | null;
  dispose(): void;
}
