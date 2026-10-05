/**
 * Pilote réseau (§15.5) : même interface que le pilote local. Le serveur est autoritaire ; le client
 * reconstruit l'état du moteur à partir de la projection reçue (`viewFromProjection` puis
 * `stateFromView`) et s'en sert pour les coups légaux et les aperçus.
 *
 * Les actions sans tirage (choix et poses provisoires, retour arrière) sont prédites localement
 * pour une interface sans latence, puis réconciliées : à chaque état reçu, les actions déjà traitées
 * par le serveur (`lastClientSeq`) sont oubliées et les autres sont rejouées sur l'état reçu.
 */
import { Client, type Room } from '@colyseus/sdk';
import { officialRuleSet } from '@crassecadia/content';
import {
  type Action,
  applyAction,
  checkAction,
  type GameEvent,
  type GameState,
  type Replay,
  type RuleSet,
  type ScoreReport,
  type SeatId,
  stateFromView,
} from '@crassecadia/engine';
import {
  type ActionRejectedMessage,
  type ChatLine,
  CLOSE_KICKED,
  GAME_ROOM,
  type GameOverMessage,
  JoinError,
  PROTOCOL_VERSION,
  type ProjectedRoom,
  type RoomCreation,
  type RoomSettingsPatch,
  viewFromProjection,
  type WelcomeMessage,
} from '@crassecadia/protocol';
import { clearSession, type SavedSession, saveSession, serverEndpoint } from '../net/endpoint.ts';
import type { ConnectionStatus, DriverUpdate, GameDriver, SendResult } from './driver.ts';

/** Actions appliquées localement sans attendre le serveur : elles ne font aucun tirage. */
const PREDICTED: ReadonlySet<Action['type']> = new Set([
  'chooseTile',
  'placeTile',
  'chooseToken',
  'placeToken',
  'undo',
]);

/** Code Colyseus « salon introuvable ». */
const ROOM_NOT_FOUND = 522;

export type OnlineErrorCode =
  | 'protocol-mismatch'
  | 'not-found'
  | 'invalid-seat'
  | 'in-progress'
  | 'full'
  | 'invalid-options'
  | 'over-budget'
  | 'wrong-password'
  | 'too-many-attempts'
  | 'locked'
  | 'spectators-disabled'
  | 'kicked'
  | 'discord'
  | 'replaced'
  | 'network';

export class OnlineError extends Error {
  constructor(readonly code: OnlineErrorCode) {
    super(code);
    this.name = 'OnlineError';
  }
}

function errorCode(e: unknown): OnlineErrorCode {
  switch ((e as { code?: number } | null)?.code) {
    case JoinError.protocolMismatch:
      return 'protocol-mismatch';
    case JoinError.invalidSeatToken:
      return 'invalid-seat';
    case JoinError.gameInProgress:
      return 'in-progress';
    case JoinError.full:
      return 'full';
    case JoinError.invalidOptions:
      return 'invalid-options';
    case JoinError.overBudget:
      return 'over-budget';
    case JoinError.wrongPassword:
      return 'wrong-password';
    case JoinError.tooManyAttempts:
      return 'too-many-attempts';
    case JoinError.locked:
      return 'locked';
    case JoinError.spectatorsDisabled:
      return 'spectators-disabled';
    case JoinError.discordAuth:
      return 'discord';
    case ROOM_NOT_FOUND:
      return 'not-found';
    default:
      return 'network';
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface JoinTarget {
  readonly roomId?: string;
  readonly discordToken?: string;
  readonly create?: RoomCreation;
  readonly password?: string;
  readonly spectator?: boolean;
}

export class NetworkDriver implements GameDriver {
  readonly sharedScreen = false;
  /** Spectateur : aucun siège, informations publiques uniquement (§12.3). */
  spectator = false;
  seat: SeatId = '';
  roomId = '';
  connection: ConnectionStatus = 'online';
  /** Erreur définitive (connexion perdue sans retour possible). */
  failure: OnlineErrorCode | null = null;
  gameOver: GameOverMessage | null = null;

  private readonly client: Client;
  private room: Room | null = null;
  private token = '';
  private clientSeq = 0;
  /** Décalage horloge du serveur − horloge locale (ms). */
  private offset = 0;
  private projection: ProjectedRoom | null = null;
  private ruleSet: RuleSet | null = null;
  private ruleSetKey = '';
  /** État reçu du serveur, et état affiché (avec les actions prédites). */
  private base: GameState | null = null;
  private state: GameState | null = null;
  private pending: { clientSeq: number; action: Action }[] = [];
  /** Actions non prédites envoyées et pas encore traitées (anti double-clic). */
  private inFlight: { clientSeq: number; key: string }[] = [];
  private events: GameEvent[] = [];
  private report: ScoreReport | null = null;
  private rejected: string | null = null;
  private disposed = false;
  private readonly listeners = new Set<(u: DriverUpdate) => void>();
  private readonly roomListeners = new Set<(room: ProjectedRoom) => void>();
  /** Chat reçu (§11.2), en mémoire uniquement. */
  chatLines: ChatLine[] = [];
  private readonly chatListeners = new Set<(lines: ChatLine[]) => void>();

  private constructor(
    readonly endpoint: string,
    readonly name: string,
  ) {
    this.client = new Client(endpoint);
  }

  /** Crée un salon ; le créateur en est l'hôte et le configure en salle d'attente (§12.3). */
  static create(name: string, create: RoomCreation, endpoint = serverEndpoint()) {
    return NetworkDriver.open(endpoint, name, { create });
  }

  /** Rejoint un salon par son code (§16.3), en joueur ou en spectateur. */
  static join(
    name: string,
    roomId: string,
    options: {
      readonly password?: string;
      readonly spectator?: boolean;
      readonly discordToken?: string;
    } = {},
    endpoint = serverEndpoint(),
  ) {
    return NetworkDriver.open(endpoint, name, {
      roomId: roomId.trim().toUpperCase(),
      ...options,
    });
  }

  /** Reprend la session mémorisée après un rechargement de la page (§11.4). */
  static async resume(saved: SavedSession): Promise<NetworkDriver> {
    const driver = new NetworkDriver(saved.endpoint, saved.name);
    driver.roomId = saved.roomId;
    driver.token = saved.seatToken;
    await driver.connect({ roomId: saved.roomId });
    return driver;
  }

  private static async open(endpoint: string, name: string, target: JoinTarget) {
    const driver = new NetworkDriver(endpoint, name);
    await driver.connect(target);
    return driver;
  }

  private async connect(target: JoinTarget): Promise<void> {
    const options = {
      protocol: PROTOCOL_VERSION,
      platform: 'web' as const,
      name: this.name,
      ...(this.token ? { seatToken: this.token } : {}),
      ...(target.password ? { password: target.password } : {}),
      ...(target.spectator ? { spectator: true } : {}),
      ...(target.discordToken ? { discordToken: target.discordToken } : {}),
      ...(target.create ? { create: target.create } : {}),
    };
    let room: Room;
    try {
      room = target.roomId
        ? await this.client.joinById(target.roomId, options)
        : await this.client.create(GAME_ROOM, options);
    } catch (e) {
      throw new OnlineError(errorCode(e));
    }
    await this.attach(room);
  }

  /** Branche les gestionnaires d'un salon et attend l'accueil (siège et jeton). */
  private attach(room: Room): Promise<void> {
    this.room = room;
    room.reconnection.enabled = false;
    let welcome: { resolve: () => void; reject: (e: OnlineError) => void } | null = null;
    const welcomed = new Promise<void>((resolve, reject) => {
      welcome = { resolve, reject };
      room.onMessage('welcome', (w: WelcomeMessage) => {
        this.seat = w.seat;
        this.spectator = w.spectator;
        this.roomId = w.roomId;
        this.token = w.seatToken;
        this.offset = w.serverTime - Date.now();
        this.clientSeq = Math.max(this.clientSeq, w.lastClientSeq);
        // Un spectateur n'a pas de siège à reprendre après un F5.
        if (!w.spectator) {
          saveSession({
            endpoint: this.endpoint,
            roomId: w.roomId,
            seatToken: w.seatToken,
            name: this.name,
          });
        }
        // L'état complet a pu arriver avant l'accueil : on le relit avec le siège connu.
        this.onProjection((room.state as { toJSON(): ProjectedRoom }).toJSON());
        welcome = null;
        resolve();
      });
    });
    room.onStateChange((s: { toJSON(): ProjectedRoom }) => this.onProjection(s.toJSON()));
    room.onMessage('events', (m: { events: GameEvent[] }) => {
      this.events.push(...m.events);
      this.emit();
    });
    room.onMessage('scoreReport', (m: { report: ScoreReport }) => {
      this.report = m.report;
      this.emit();
    });
    room.onMessage('gameOver', (m: GameOverMessage) => {
      this.gameOver = m;
      this.emit();
    });
    room.onMessage('actionRejected', (m: ActionRejectedMessage) => {
      this.rejected = m.reason;
      if (m.clientSeq !== null) {
        this.pending = this.pending.filter((p) => p.clientSeq !== m.clientSeq);
        this.inFlight = this.inFlight.filter((p) => p.clientSeq !== m.clientSeq);
        this.recompute();
      }
      this.emit();
      this.notifyRoom();
    });
    room.onMessage('pong', () => {});
    room.onMessage('chat', (line: ChatLine) => this.addChat([line]));
    room.onMessage('chatHistory', (m: { lines: ChatLine[] }) => this.addChat(m.lines));
    room.onLeave((code: number) => {
      // Salon fermé avant l'accueil : la connexion échoue.
      if (welcome) {
        welcome.reject(new OnlineError(code === 4000 ? 'replaced' : 'network'));
        welcome = null;
        return;
      }
      if (this.disposed || this.room !== room) return;
      // 4000 : départ consenti côté serveur (siège repris par un autre onglet, salon fermé).
      if (code === CLOSE_KICKED) this.fail('kicked');
      else if (code === 4000) this.fail(this.spectator ? 'network' : 'replaced');
      else void this.reconnect();
    });
    return welcomed;
  }

  /** Reconnexion automatique avec le jeton de siège (coupure réseau, serveur redémarré). */
  private async reconnect(): Promise<void> {
    this.setConnection('reconnecting');
    for (let attempt = 0; !this.disposed; attempt++) {
      await sleep(Math.min(8000, 500 * 2 ** attempt));
      if (this.disposed) return;
      try {
        await this.connect({ roomId: this.roomId });
        this.setConnection('online');
        return;
      } catch (e) {
        const code = e instanceof OnlineError ? e.code : 'network';
        if (code !== 'network' || attempt >= 30) {
          this.fail(code);
          return;
        }
      }
    }
  }

  private fail(code: OnlineErrorCode): void {
    this.failure = code;
    clearSession();
    this.setConnection('closed');
  }

  private setConnection(status: ConnectionStatus): void {
    this.connection = status;
    this.emit();
    this.notifyRoom();
  }

  private onProjection(projection: ProjectedRoom): void {
    this.projection = projection;
    const viewer = this.spectator ? 'spectator' : this.seat;
    const view = viewer ? viewFromProjection(projection, viewer) : null;
    if (view) {
      const key = projection.game!.info;
      if (!this.ruleSet || key !== this.ruleSetKey) {
        this.ruleSet = officialRuleSet(view.config);
        this.ruleSetKey = key;
      }
      // Noms d'affichage à jour (un joueur arrivé en cours de partie reprend le siège d'un bot).
      const names = projection.seats;
      const config = {
        ...view.config,
        seats: view.config.seats.map((s) => ({ ...s, name: names[s.id]?.name ?? s.name })),
      };
      this.base = stateFromView({ ...view, config }, this.ruleSet);
      const ack = projection.privates?.[this.seat]?.lastClientSeq ?? 0;
      this.pending = this.pending.filter((p) => p.clientSeq > ack);
      this.inFlight = this.inFlight.filter((p) => p.clientSeq > ack);
      this.recompute();
      this.emit();
    }
    this.notifyRoom();
  }

  /** État affiché : état reçu + actions prédites pas encore traitées par le serveur. */
  private recompute(): void {
    let s = this.base;
    if (!s) return;
    for (const p of this.pending) {
      const res = applyAction(s, p.action);
      if (!res.ok) {
        // Prédiction contredite par le serveur : on s'en tient à l'état reçu.
        this.pending = [];
        s = this.base;
        break;
      }
      s = res.state;
    }
    this.state = s;
  }

  /* ---------------------------------------------------------------- salle d'attente */

  /** Projection courante du salon (salle d'attente comprise). */
  get lobby(): ProjectedRoom | null {
    return this.projection;
  }

  get started(): boolean {
    return this.state !== null;
  }

  /** Dernier refus reçu, consommé par la salle d'attente. */
  takeRejection(): string | null {
    const r = this.rejected;
    this.rejected = null;
    return r;
  }

  onRoom(listener: (room: ProjectedRoom) => void): () => void {
    this.roomListeners.add(listener);
    if (this.projection) listener(this.projection);
    return () => this.roomListeners.delete(listener);
  }

  private notifyRoom(): void {
    if (!this.projection) return;
    for (const l of this.roomListeners) l(this.projection);
  }

  /* ---------------------------------------------------------------- chat (§11.2) */

  private addChat(lines: readonly ChatLine[]): void {
    const known = new Set(this.chatLines.map((l) => l.id));
    const fresh = lines.filter((l) => !known.has(l.id));
    if (fresh.length === 0) return;
    this.chatLines = [...this.chatLines, ...fresh].sort((a, b) => a.id - b.id).slice(-200);
    for (const l of this.chatListeners) l(this.chatLines);
  }

  onChat(listener: (lines: ChatLine[]) => void): () => void {
    this.chatListeners.add(listener);
    listener(this.chatLines);
    return () => this.chatListeners.delete(listener);
  }

  /** `team` : chat d'équipe (général en individuel) ; `all` : chat général. */
  sendChat(text: string, scope: 'team' | 'all'): void {
    this.room?.send('chat', { text, scope });
  }

  /** Commandes de l'hôte (§12.3) ; `team` est aussi permise à un joueur pour son propre siège. */
  startGame(): void {
    this.room?.send('start', {});
  }

  /** Modification partielle des paramètres (§12.4), fusionnée par le serveur. */
  sendSettings(patch: RoomSettingsPatch): void {
    this.room?.send('settings', { patch });
  }

  applyPreset(preset: 'official' | 'initiation' | 'chaos'): void {
    this.room?.send('preset', { preset });
  }

  kick(seat: SeatId): void {
    this.room?.send('kick', { seat });
  }

  setLocked(locked: boolean): void {
    this.room?.send('lock', { locked });
  }

  transferHost(seat: SeatId): void {
    this.room?.send('transferHost', { seat });
  }

  setTeam(seat: SeatId, team: number): void {
    this.room?.send('team', { seat, team });
  }

  /* ---------------------------------------------------------------- GameDriver */

  get localSeats(): SeatId[] {
    const s = this.base;
    const seats = this.projection?.seats;
    if (this.spectator) return [];
    if (!s || !seats || s.phase !== 'playing') return [this.seat];
    // En équipe, on peut jouer le tour d'un coéquipier déconnecté (§11.4).
    const camp = s.seatCamp[this.seat];
    const mates = s.config.seats
      .filter(
        (x) =>
          x.id !== this.seat &&
          x.bot === null &&
          s.seatCamp[x.id] === camp &&
          seats[x.id]?.connected === false,
      )
      .map((x) => x.id);
    return [this.seat, ...mates];
  }

  get current(): DriverUpdate {
    const deadline = this.projection?.game?.deadline ?? 0;
    return {
      state: this.state!,
      events: [],
      deadline: deadline > 0 ? deadline - this.offset : null,
      report: this.report,
      rejected: null,
      connection: this.connection,
    };
  }

  subscribe(listener: (u: DriverUpdate) => void): () => void {
    this.listeners.add(listener);
    if (this.state) listener(this.current);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    if (!this.state) return;
    const update: DriverUpdate = { ...this.current, events: this.events, rejected: this.rejected };
    this.events = [];
    this.rejected = null;
    for (const l of this.listeners) l(update);
  }

  send(action: Action): SendResult {
    const state = this.state;
    if (!state || !this.room) return { ok: false, reason: 'not-started' };
    if (this.connection !== 'online') return { ok: false, reason: 'offline' };
    // Même réponse immédiate que le pilote local ; le serveur reste seul juge.
    const reason = checkAction(state, action);
    if (reason !== null) return { ok: false, reason };
    const key = JSON.stringify(action);
    if (this.inFlight.some((p) => p.key === key)) return { ok: true };
    this.clientSeq += 1;
    this.room.send('action', { clientSeq: this.clientSeq, turnIndex: state.turnIndex, action });
    if (PREDICTED.has(action.type)) {
      this.pending.push({ clientSeq: this.clientSeq, action });
      this.recompute();
      this.emit();
    } else {
      this.inFlight.push({ clientSeq: this.clientSeq, key });
    }
    return { ok: true };
  }

  replay(): Replay | null {
    return this.gameOver?.replay ?? null;
  }

  /** Quitter volontairement : le siège est libéré en salle d'attente, joué par le bot en partie. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    clearSession();
    this.listeners.clear();
    this.roomListeners.clear();
    this.chatListeners.clear();
    void this.room?.leave(true);
  }
}
