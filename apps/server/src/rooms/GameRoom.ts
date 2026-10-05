/**
 * `GameRoom` (§15.5) : salon de jeu autoritaire. Le client demande, le serveur décide (§15.1) :
 * chaque action est validée par Zod puis par le moteur, appliquée à l'état autoritaire, projetée
 * dans le Schema, et ses événements sont diffusés.
 *
 * Cycle de vie : salle d'attente (paramètres du §12.4, équipes, droits de l'hôte, §12.3) → partie
 * → fin. Salons public, protégé ou privé, fiche du navigateur de salons, spectateurs, rejoindre en
 * cours. Minuteurs et jeu automatique (§6.10), bots (§11.5), déconnexion et reconnexion (§11.4).
 */
import { randomBytes } from 'node:crypto';
import {
  type AuthContext,
  type Client,
  CloseCode,
  matchMaker,
  Room,
  ServerError,
} from '@colyseus/core';
import { StateView } from '@colyseus/schema';
import { createOfficialGame, officialRuleSet } from '@crassecadia/content';
import {
  type Action,
  actingSeats,
  activeSeat,
  applyAction,
  autoPlay,
  type BotLevel,
  botAction,
  type CampId,
  evaluate,
  finalRanking,
  type GameState,
  type Rng,
  rngFromSeed,
  type SeatConfig,
  type SeatId,
  SYSTEM_SEAT,
  validateConfig,
} from '@crassecadia/engine';
import {
  type ActionMessage,
  ActionMessageSchema,
  type ActionRejectedMessage,
  type ChatLine,
  ChatMessageSchema,
  CLOSE_KICKED,
  DEFAULT_TILE_BUDGET,
  eventsForCamp,
  type GameOverMessage,
  humanSeats,
  JoinError,
  type JoinOptions,
  JoinOptionsSchema,
  KickMessageSchema,
  LockMessageSchema,
  PROTOCOL_VERSION,
  PresetMessageSchema,
  type RoomListing,
  type RoomSettings,
  type RoomSettingsPatch,
  RoomSettingsSchema,
  SettingsMessageSchema,
  settingsTileCount,
  settingsToConfig,
  TeamMessageSchema,
  TransferHostMessageSchema,
  type WelcomeMessage,
} from '@crassecadia/protocol';
import type { z } from 'zod';
import { type DiscordApi, discordTag, displayName, guestTag } from '../identity.ts';
import {
  cryptoShuffle,
  defaultSettings,
  PasswordGuard,
  presetSettings,
  startTeams,
} from './lobby.ts';
import { Projector } from './projection.ts';
import { RoomStateSchema, SeatSchema } from './schema.ts';

/** Délais du salon ; réduits dans les tests. */
export interface GameRoomTiming {
  /** Délai entre deux actions d'un siège de bot, pour que les humains suivent la partie. */
  readonly botDelayMs: number;
  /** Délai de grâce avant que le bot Facile joue pour un déconnecté (3 premiers tours, §11.4). */
  readonly graceMs: number;
  /** Délai au-delà de 3 tours consécutifs de déconnexion (§11.4). */
  readonly fastMs: number;
  /** Minuteurs des votes d'objectifs (§10.5) et des tuiles de départ (§5.6). */
  readonly voteMs: { readonly initial: number; readonly resupply: number };
  readonly startTileMs: number;
  /** Remplace le minuteur du tour de la configuration (tests uniquement). */
  readonly turnMsOverride?: number;
  /** Validité du jeton de reconnexion après la dernière connexion (§11.4 : 3 h). */
  readonly tokenTtlMs: number;
  /** Fermeture d'un salon sans aucun humain connecté : salle d'attente, fin de partie, en jeu. */
  readonly idleLobbyMs: number;
  readonly idleEndedMs: number;
  readonly idleGameMs: number;
}

export const DEFAULT_TIMING: GameRoomTiming = {
  botDelayMs: 500,
  graceMs: 30_000,
  fastMs: 5_000,
  voteMs: { initial: 30_000, resupply: 20_000 },
  startTileMs: 30_000,
  tokenTtlMs: 3 * 3600_000,
  idleLobbyMs: 10 * 60_000,
  idleEndedMs: 10 * 60_000,
  idleGameMs: 3 * 3600_000,
};

/** Budget de tuiles par salon (§12.4 : limite d'hébergement réglable par l'exploitant). */
export const TILE_BUDGET = Number(process.env.ROOM_TILE_BUDGET ?? DEFAULT_TILE_BUDGET);

/** Région affichée par le navigateur de salons (§12.3). */
const REGION = process.env.REGION ?? 'eu';

/** Chat (§11.2) : débit par siège (messages par fenêtre glissante), lignes gardées en mémoire. */
const CHAT_RATE = { messages: 5, windowMs: 10_000 } as const;
const CHAT_HISTORY = 50;

/** Spectateurs au plus par salon. */
const MAX_SPECTATORS = 32;

/** Nombre de tours joués par le bot pour un déconnecté avant de passer au délai court (§11.4). */
const GRACE_TURNS = 3;

/** Codes de salon : 6 caractères sans ambiguïté (§16.3). */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

interface SeatRecord {
  readonly id: SeatId;
  name: string;
  bot: BotLevel | null;
  /** Jeton de reconnexion (sièges humains). */
  token: string | null;
  tokenExpires: number;
  client: Client | null;
  lastClientSeq: number;
  /** Tours consécutifs joués par le bot pendant la déconnexion (§11.4). */
  missedTurns: number;
  /** Équipe choisie en salle d'attente (composition libre, §11.1). */
  team: number;
  /** Siège humain libéré en partie (départ volontaire, expulsion) : joué par le bot, reprenable. */
  freed: boolean;
  /** Ordre d'arrivée (humains), puis bots. */
  readonly order: number;
}

interface ClientData {
  seat: SeatId | null;
}

type Auth =
  | { readonly kind: 'seat'; readonly seat: SeatId }
  | { readonly kind: 'new'; readonly name: string }
  | { readonly kind: 'takeover'; readonly name: string }
  | { readonly kind: 'spectator' };

type Timer = ReturnType<Room['clock']['setTimeout']>;

function randomCode(): string {
  const bytes = randomBytes(6);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

const fail = (code: number, message: string) => new ServerError(code, message);

/** Motif de refus d'une configuration : moteur et contenu officiel (§12.4). */
function configProblem(settings: RoomSettings): string | null {
  const seats: SeatConfig[] = Array.from({ length: settings.seats }, (_, i) => ({
    id: `s${i}`,
    name: '',
    bot: null,
  }));
  try {
    const config = settingsToConfig(settings, seats, null);
    if (validateConfig(config, officialRuleSet(config)).length > 0) return 'invalid-settings';
  } catch {
    return 'invalid-settings';
  }
  return settingsTileCount(settings) > TILE_BUDGET ? 'over-budget' : null;
}

export class GameRoom extends Room<{ state: RoomStateSchema }> {
  /** Délais ; remplacés par une sous-classe dans les tests. */
  timing: GameRoomTiming = DEFAULT_TIMING;
  /** API Discord pour vérifier l'identité des joueurs d'une Activity (§16.4), si configurée. */
  discord: DiscordApi | null = null;

  private settings: RoomSettings = defaultSettings();
  private password = new PasswordGuard(undefined);
  /** Le créateur du salon n'a pas encore rejoint : il entre sans mot de passe. */
  private creatorPending = true;
  private readonly seats = new Map<SeatId, SeatRecord>();
  private nextOrder = 0;
  private projector!: Projector;
  private game: GameState | null = null;
  private seed = '';
  private botRng: Rng = rngFromSeed('bots');
  /** Actions appliquées, pour le replay (§15.4). */
  private readonly history: Action[] = [];
  private busy = false;

  private turnTimer: Timer | null = null;
  private turnKey = '';
  private turnDeadline: number | null = null;
  /** Temps restant du tour mis en pause pendant un ravitaillement (§10.5). */
  private paused: { key: string; remaining: number } | null = null;
  private botTimer: Timer | null = null;
  private absent: { key: string; deadline: number } | null = null;
  private idleTimer: Timer | null = null;
  /** Chat en mémoire vive uniquement, détruit à la fin de la partie (§11.2, §18.3). */
  private chatLines: { line: ChatLine; camp: CampId | null }[] = [];
  private nextChatId = 1;
  private readonly chatTimes = new Map<SeatId, number[]>();

  override async onCreate(options: unknown): Promise<void> {
    const parsed = JoinOptionsSchema.safeParse(options);
    if (!parsed.success || !parsed.data.create) {
      throw fail(JoinError.invalidOptions, 'invalid-options');
    }
    if (parsed.data.protocol !== PROTOCOL_VERSION) {
      throw fail(JoinError.protocolMismatch, `protocol-mismatch:${PROTOCOL_VERSION}`);
    }
    const creation = parsed.data.create;
    this.password = new PasswordGuard(
      creation.visibility === 'protected' ? creation.password : undefined,
    );
    this.roomId = await this.uniqueCode();
    this.autoDispose = false;
    // Les limites de sièges sont contrôlées à l'entrée : marge pour les reconnexions et spectateurs.
    this.maxClients = 2 * 999 + MAX_SPECTATORS;
    this.maxMessagesPerSecond = 40;
    this.setState(
      new RoomStateSchema({
        protocol: PROTOCOL_VERSION,
        stage: 'lobby',
        name: creation.name,
        visibility: creation.visibility,
        locked: false,
        language: creation.language,
        spectators: 0,
        host: '',
        settings: JSON.stringify(this.settings),
      }),
    );
    this.projector = new Projector(this.state);
    // Salon d'une Activity Discord : préréglage officiel, ouvert aux membres du vocal qui arrivent
    // en cours de partie (§12.3, §16.3). Il est créé par le serveur, sans créateur à attendre.
    if (parsed.data.discordInstance !== undefined) {
      this.creatorPending = false;
      this.settings = {
        ...(presetSettings('official', this.settings) ?? this.settings),
        spectators: true,
        joinInProgress: true,
      };
      this.state.settings = JSON.stringify(this.settings);
    }
    // Les salons privés ne sont jamais listés : accès par code ou lien (§12.3).
    if (creation.visibility === 'private') await this.setPrivate(true);

    this.onMessage('action', (client, message) => this.onAction(client, message));
    this.onMessage('start', (client) => this.onStart(client));
    this.onMessage('settings', (client, m) =>
      this.hostCommand(client, SettingsMessageSchema, m, (x) => this.onPatch(x.patch)),
    );
    this.onMessage('preset', (client, m) =>
      this.hostCommand(client, PresetMessageSchema, m, (x) => this.onPreset(x.preset)),
    );
    this.onMessage('kick', (client, m) =>
      this.hostCommand(client, KickMessageSchema, m, (x) => this.onKick(x.seat)),
    );
    this.onMessage('lock', (client, m) =>
      this.hostCommand(client, LockMessageSchema, m, (x) => this.onLock(x.locked)),
    );
    this.onMessage('transferHost', (client, m) =>
      this.hostCommand(client, TransferHostMessageSchema, m, (x) => this.onTransferHost(x.seat)),
    );
    this.onMessage('team', (client, m) => this.onTeam(client, m));
    this.onMessage('chat', (client, message) => this.onChat(client, message));
    this.onMessage('ping', (client) => client.send('pong', { serverTime: Date.now() }));
    this.updateListing();
    this.resetIdle();
  }

  private async uniqueCode(): Promise<string> {
    for (;;) {
      const code = randomCode();
      if ((await matchMaker.query({ roomId: code })).length === 0) return code;
    }
  }

  /* ---------------------------------------------------------------- connexions */

  private humans(): SeatRecord[] {
    return [...this.seats.values()].filter((s) => s.bot === null || s.token !== null);
  }

  /** Sièges reprenables en cours de partie (§12.3) : libérés d'abord, puis bots. */
  private takeoverSeats(): SeatRecord[] {
    if (!this.game || this.game.phase === 'ended' || !this.settings.joinInProgress) return [];
    const order = this.game.config.seats.map((s) => this.seats.get(s.id)!);
    return [...order.filter((s) => s.freed), ...order.filter((s) => s.bot !== null && !s.freed)];
  }

  /** Pseudo affiché (§16.4) : vérifié auprès de Discord pour une Activity, `Nom#XXX` sinon. */
  private async playerName(hello: JoinOptions): Promise<string> {
    if (hello.discordToken === undefined) return displayName(hello.name, guestTag());
    if (!this.discord) throw fail(JoinError.invalidOptions, 'discord-not-configured');
    try {
      const user = await this.discord.user(hello.discordToken);
      return displayName(user.global_name ?? user.username, discordTag(user.id));
    } catch {
      throw fail(JoinError.discordAuth, 'discord-auth-failed');
    }
  }

  override async onAuth(_client: Client, options: unknown, context: AuthContext): Promise<Auth> {
    const parsed = JoinOptionsSchema.safeParse(options);
    if (!parsed.success) throw fail(JoinError.invalidOptions, 'invalid-options');
    const hello: JoinOptions = parsed.data;
    if (hello.protocol !== PROTOCOL_VERSION) {
      throw fail(JoinError.protocolMismatch, `protocol-mismatch:${PROTOCOL_VERSION}`);
    }
    if (hello.seatToken !== undefined) {
      const seat = [...this.seats.values()].find((s) => s.token === hello.seatToken);
      if (!seat || (seat.client === null && seat.tokenExpires < Date.now())) {
        throw fail(JoinError.invalidSeatToken, 'invalid-seat-token');
      }
      return { kind: 'seat', seat: seat.id };
    }
    const creator = this.creatorPending && hello.create !== undefined;
    if (!creator) {
      if (this.state.locked) throw fail(JoinError.locked, 'locked');
      // Derrière un relais (Caddy, Tailscale) : première adresse de `X-Forwarded-For`.
      const raw = Array.isArray(context.ip) ? (context.ip[0] ?? '') : (context.ip ?? '');
      const ip = raw.split(',')[0]!.trim();
      const check = this.password.check(hello.password, ip);
      if (check === 'too-many') throw fail(JoinError.tooManyAttempts, 'too-many-attempts');
      if (check === 'wrong') throw fail(JoinError.wrongPassword, 'wrong-password');
    }
    if (hello.spectator) {
      if (!this.settings.spectators) throw fail(JoinError.spectatorsDisabled, 'no-spectators');
      if (this.state.spectators >= MAX_SPECTATORS) throw fail(JoinError.full, 'full');
      return { kind: 'spectator' };
    }
    if (this.game) {
      if (this.takeoverSeats().length === 0) {
        throw fail(JoinError.gameInProgress, 'game-in-progress');
      }
      return { kind: 'takeover', name: await this.playerName(hello) };
    }
    if (this.humans().length >= humanSeats(this.settings)) throw fail(JoinError.full, 'full');
    return { kind: 'new', name: await this.playerName(hello) };
  }

  override onJoin(client: Client, _options: unknown, auth: Auth) {
    this.creatorPending = false;
    if (auth.kind === 'spectator') {
      client.userData = { seat: null } satisfies ClientData;
      client.view = new StateView();
      this.state.spectators += 1;
      client.send('welcome', this.welcome(null));
      if (this.game) client.send('scoreReport', { report: evaluate(this.game) });
      this.sendChatHistory(client, null);
      this.updateListing();
      return;
    }
    let seat: SeatRecord | undefined;
    if (auth.kind === 'seat') seat = this.seats.get(auth.seat);
    else if (auth.kind === 'takeover') seat = this.takeOver(auth.name);
    else seat = this.addHuman(auth.name);
    if (!seat) throw fail(JoinError.full, 'full');
    if (this.state.host === '') this.state.host = seat.id;
    // Reconnexion (F5) avant la fermeture de l'ancienne connexion : la nouvelle la remplace.
    const previous = seat.client;
    seat.client = client;
    seat.missedTurns = 0;
    seat.tokenExpires = Date.now() + this.timing.tokenTtlMs;
    if (previous && previous !== client) previous.leave(CloseCode.CONSENTED);
    client.userData = { seat: seat.id } satisfies ClientData;
    client.view = new StateView();
    client.view.add(this.projector.privateOf(seat.id));
    this.state.seats.get(seat.id)!.connected = true;
    client.send('welcome', this.welcome(seat));
    if (this.game) client.send('scoreReport', { report: evaluate(this.game) });
    this.sendChatHistory(client, seat.id);
    this.updateListing();
    this.resetIdle();
    this.schedule();
  }

  private welcome(seat: SeatRecord | null): WelcomeMessage {
    return {
      protocol: PROTOCOL_VERSION,
      roomId: this.roomId,
      seat: seat?.id ?? '',
      seatToken: seat?.token ?? '',
      serverTime: Date.now(),
      lastClientSeq: seat?.lastClientSeq ?? 0,
      spectator: seat === null,
    };
  }

  private addSeat(record: SeatRecord): SeatRecord {
    this.seats.set(record.id, record);
    this.state.seats.set(
      record.id,
      new SeatSchema({
        id: record.id,
        name: record.name,
        bot: record.bot ?? '',
        connected: record.bot !== null,
        team: this.settings.teams.mode === 'none' ? -1 : record.team,
      }),
    );
    return record;
  }

  private addHuman(name: string): SeatRecord | undefined {
    if (this.game || this.humans().length >= humanSeats(this.settings)) return undefined;
    const order = this.nextOrder++;
    return this.addSeat({
      id: `p${order}`,
      name,
      bot: null,
      token: randomBytes(32).toString('base64url'),
      tokenExpires: 0,
      client: null,
      lastClientSeq: 0,
      missedTurns: 0,
      team: this.smallestTeam(),
      freed: false,
      order,
    });
  }

  /** Rejoindre en cours (§12.3, O9) : on prend un siège libéré, sinon celui d'un bot. */
  private takeOver(name: string): SeatRecord | undefined {
    const seat = this.takeoverSeats()[0];
    if (!seat) return undefined;
    seat.name = name;
    seat.bot = null;
    seat.freed = false;
    seat.token = randomBytes(32).toString('base64url');
    const schema = this.state.seats.get(seat.id)!;
    schema.name = name;
    schema.bot = '';
    return seat;
  }

  override onLeave(client: Client, code?: number): void {
    const data = client.userData as ClientData | undefined;
    if (data && data.seat === null) {
      this.state.spectators = Math.max(0, this.state.spectators - 1);
      this.updateListing();
      return;
    }
    const seat = data?.seat ? this.seats.get(data.seat) : undefined;
    if (!seat || seat.client !== client) return;
    seat.client = null;
    seat.tokenExpires = Date.now() + this.timing.tokenTtlMs;
    if (code === CloseCode.CONSENTED) this.release(seat);
    else this.state.seats.get(seat.id)!.connected = false;
    this.updateListing();
    this.resetIdle();
    this.schedule();
  }

  /**
   * Départ volontaire ou expulsion : en salle d'attente, le siège disparaît ; en partie, il est
   * libéré (joué par le bot, reprenable si « rejoindre en cours » est activé) et son jeton annulé.
   */
  private release(seat: SeatRecord): void {
    if (!this.game) {
      this.seats.delete(seat.id);
      this.state.seats.delete(seat.id);
      this.state.privates.delete(seat.id);
    } else {
      seat.freed = true;
      seat.token = null;
      this.state.seats.get(seat.id)!.connected = false;
    }
    if (this.state.host === seat.id) this.transferHost();
  }

  /** L'hôte passe au plus ancien joueur présent (§12.3). */
  private transferHost(): void {
    const next = this.humans()
      .filter((s) => s.client !== null)
      .sort((a, b) => a.order - b.order)[0];
    this.state.host = next?.id ?? '';
  }

  private connectedHumans(): number {
    return [...this.seats.values()].filter((s) => s.client !== null).length;
  }

  /** Ferme le salon quand plus aucun humain n'est connecté depuis un certain temps. */
  private resetIdle(): void {
    if (this.idleTimer) this.idleTimer.clear();
    this.idleTimer = null;
    if (this.connectedHumans() > 0) return;
    const delay =
      this.game === null
        ? this.timing.idleLobbyMs
        : this.game.phase === 'ended'
          ? this.timing.idleEndedMs
          : this.timing.idleGameMs;
    this.idleTimer = this.clock.setTimeout(() => void this.disconnect(), delay);
  }

  /* ---------------------------------------------------------------- chat (§11.2) */

  /** Camp d'un siège pour le chat d'équipe ; `null` en individuel ou en salle d'attente. */
  private chatCamp(seat: SeatId | null): CampId | null {
    if (!seat || !this.game?.config.teams) return null;
    return this.game.seatCamp[seat] ?? null;
  }

  private onChat(client: Client, message: unknown): void {
    const seat = (client.userData as ClientData | undefined)?.seat;
    const record = seat ? this.seats.get(seat) : undefined;
    // Les spectateurs lisent le chat général sans y écrire.
    if (!record || record.client !== client) {
      this.reject(client, null, 'not-seated');
      return;
    }
    const parsed = ChatMessageSchema.safeParse(message);
    if (!parsed.success) {
      this.reject(client, null, 'invalid-chat');
      return;
    }
    const now = Date.now();
    const recent = (this.chatTimes.get(record.id) ?? []).filter(
      (t) => now - t < CHAT_RATE.windowMs,
    );
    if (recent.length >= CHAT_RATE.messages) {
      this.reject(client, null, 'chat-rate-limited');
      return;
    }
    this.chatTimes.set(record.id, [...recent, now]);
    const camp = parsed.data.scope === 'team' ? this.chatCamp(record.id) : null;
    const line: ChatLine = {
      id: this.nextChatId++,
      seat: record.id,
      name: record.name,
      team: camp !== null,
      text: parsed.data.text,
    };
    // Après la fin de la partie, les messages circulent encore mais ne sont plus gardés.
    if (this.game?.phase !== 'ended') {
      this.chatLines = [...this.chatLines, { line, camp }].slice(-CHAT_HISTORY);
    }
    for (const c of this.clients) {
      if (
        camp === null ||
        this.chatCamp((c.userData as ClientData | undefined)?.seat ?? null) === camp
      ) {
        c.send('chat', line);
      }
    }
  }

  private sendChatHistory(client: Client, seat: SeatId | null): void {
    const camp = this.chatCamp(seat);
    const lines = this.chatLines
      .filter((x) => x.camp === null || x.camp === camp)
      .map((x) => x.line);
    if (lines.length > 0) client.send('chatHistory', { lines });
  }

  /* ---------------------------------------------------------------- navigateur de salons */

  private listing(): RoomListing {
    const humans = this.humans();
    const lobby = this.game === null;
    const maxHumans = lobby ? humanSeats(this.settings) : humans.length;
    const host = this.seats.get(this.state.host)?.name ?? '';
    return {
      name: this.state.name,
      host,
      humans: humans.filter((s) => s.token !== null).length,
      maxHumans,
      bots: [...this.seats.values()].filter((s) => s.bot !== null).length,
      stage: lobby ? 'lobby' : this.game!.phase === 'ended' ? 'ended' : 'playing',
      tiers: [
        ...new Set(this.settings.activeShapes.map((s) => this.settings.tierByShape[s]!)),
      ].sort(),
      mods: [],
      rounds: this.settings.rounds,
      timer: this.settings.turnTimerSeconds,
      language: this.state.language,
      region: REGION,
      protected: this.password.required,
      locked: this.state.locked,
      spectators: this.settings.spectators,
      joinInProgress: this.settings.joinInProgress,
      freeSeats: lobby ? Math.max(0, maxHumans - humans.length) : this.takeoverSeats().length,
    };
  }

  private updateListing(): void {
    void this.setMetadata(this.listing());
  }

  /* ---------------------------------------------------------------- droits de l'hôte */

  private reject(client: Client, clientSeq: number | null, reason: string): void {
    client.send('actionRejected', { clientSeq, reason } satisfies ActionRejectedMessage);
  }

  private hostCommand<T>(
    client: Client,
    schema: z.ZodType<T>,
    message: unknown,
    run: (payload: T) => string | null,
  ): void {
    const seat = (client.userData as ClientData | undefined)?.seat;
    if (!seat || seat !== this.state.host) {
      this.reject(client, null, 'not-host');
      return;
    }
    const parsed = schema.safeParse(message);
    if (!parsed.success) {
      this.reject(client, null, 'invalid-message');
      return;
    }
    const problem = run(parsed.data);
    if (problem !== null) this.reject(client, null, problem);
    else this.updateListing();
  }

  /** Modification partielle des paramètres, fusionnée avec les paramètres courants. */
  private onPatch(patch: RoomSettingsPatch): string | null {
    const merged = RoomSettingsSchema.safeParse({ ...this.settings, ...patch });
    return merged.success ? this.onSettings(merged.data) : 'invalid-settings';
  }

  /** Paramètres du §12.4, modifiables en salle d'attente uniquement. */
  private onSettings(settings: RoomSettings): string | null {
    if (this.game) return 'game-started';
    if (this.humans().length > humanSeats(settings)) return 'too-few-seats';
    const problem = configProblem(settings);
    if (problem !== null) return problem;
    this.settings = settings;
    this.state.settings = JSON.stringify(settings);
    this.syncBots();
    this.syncTeams();
    return null;
  }

  private onPreset(preset: string): string | null {
    const settings = presetSettings(preset, this.settings);
    return settings ? this.onSettings(settings) : 'unknown-preset';
  }

  /** Sièges de bots de la salle d'attente : nombre et niveau des paramètres (§12.4). */
  private syncBots(): void {
    const bots = [...this.seats.values()].filter((s) => s.bot !== null);
    for (const [i, b] of bots.entries()) {
      if (i >= this.settings.bots) {
        this.seats.delete(b.id);
        this.state.seats.delete(b.id);
        this.state.privates.delete(b.id);
      } else if (b.bot !== this.settings.botLevel) {
        b.bot = this.settings.botLevel;
        this.state.seats.get(b.id)!.bot = b.bot;
      }
    }
    for (let i = bots.length; i < this.settings.bots; i++) {
      this.addSeat({
        id: `b${i}`,
        name: `Bot ${i + 1}`,
        bot: this.settings.botLevel,
        token: null,
        tokenExpires: 0,
        client: null,
        lastClientSeq: 0,
        missedTurns: 0,
        team: this.smallestTeam(),
        freed: false,
        order: 1_000_000 + i,
      });
    }
  }

  /** Équipe la moins remplie (composition libre). */
  private smallestTeam(): number {
    const count = this.settings.teams.count;
    const sizes = new Array<number>(count).fill(0);
    for (const s of this.seats.values()) if (s.team < count) sizes[s.team]! += 1;
    return sizes.indexOf(Math.min(...sizes));
  }

  /** Équipes hors de l'effectif (après une réduction) : réaffectées à la moins remplie. */
  private syncTeams(): void {
    const { mode, count } = this.settings.teams;
    for (const s of [...this.seats.values()].sort((a, b) => a.order - b.order)) {
      if (s.team >= count) {
        // Hors effectif : la valeur courante n'entre pas dans le décompte de `smallestTeam`.
        s.team = this.smallestTeam();
      }
      this.state.seats.get(s.id)!.team = mode === 'none' ? -1 : s.team;
    }
  }

  /** Composition libre (§11.1) : l'hôte place n'importe quel siège, un joueur le sien. */
  private onTeam(client: Client, message: unknown): void {
    const actor = (client.userData as ClientData | undefined)?.seat;
    const parsed = TeamMessageSchema.safeParse(message);
    if (!parsed.success) {
      this.reject(client, null, 'invalid-message');
      return;
    }
    const { seat, team } = parsed.data;
    if (!actor || (actor !== seat && actor !== this.state.host)) {
      this.reject(client, null, 'not-host');
      return;
    }
    const record = this.seats.get(seat);
    if (this.game || this.settings.teams.mode !== 'manual') {
      this.reject(client, null, 'teams-not-manual');
      return;
    }
    if (!record || team >= this.settings.teams.count) {
      this.reject(client, null, 'invalid-team');
      return;
    }
    record.team = team;
    this.state.seats.get(seat)!.team = team;
  }

  private onKick(seatId: SeatId): string | null {
    const seat = this.seats.get(seatId);
    if (!seat || seat.token === null || seatId === this.state.host) return 'invalid-seat';
    const target = seat.client;
    seat.client = null;
    this.release(seat);
    target?.leave(CLOSE_KICKED);
    this.schedule();
    return null;
  }

  private onLock(locked: boolean): string | null {
    this.state.locked = locked;
    return null;
  }

  private onTransferHost(seatId: SeatId): string | null {
    const seat = this.seats.get(seatId);
    if (!seat || seat.client === null || seat.token === null) return 'invalid-seat';
    this.state.host = seatId;
    return null;
  }

  /* ---------------------------------------------------------------- lancement */

  private onStart(client: Client): void {
    const seat = (client.userData as ClientData | undefined)?.seat;
    if (this.game || !seat || seat !== this.state.host) {
      this.reject(client, null, 'not-host');
      return;
    }
    const records = [...this.seats.values()].sort((a, b) => a.order - b.order);
    const seats: SeatConfig[] = records.map((s) => ({ id: s.id, name: s.name, bot: s.bot }));
    const teams = startTeams(this.settings, records, cryptoShuffle);
    const config = settingsToConfig(this.settings, seats, teams);
    if (validateConfig(config, officialRuleSet(config)).length > 0) {
      this.reject(client, null, 'invalid-settings');
      return;
    }
    this.seed = randomBytes(16).toString('hex');
    this.botRng = rngFromSeed(`${this.seed}:bots`);
    this.game = createOfficialGame(config, this.seed);
    this.projector.start(this.game);
    this.state.stage = 'game';
    for (const s of records) {
      this.state.seats.get(s.id)!.team = teams
        ? teams.findIndex((t) => t.seats.includes(s.id))
        : -1;
    }
    this.broadcast('scoreReport', { report: evaluate(this.game) }, { afterNextPatch: true });
    this.updateListing();
    this.schedule();
  }

  /* ---------------------------------------------------------------- actions */

  /** Un siège peut jouer pour lui-même, ou pour un coéquipier déconnecté (§11.4). */
  private canControl(actor: SeatId, seat: SeatId): boolean {
    if (actor === seat) return true;
    const game = this.game!;
    const target = this.seats.get(seat);
    return (
      target !== undefined &&
      target.bot === null &&
      target.client === null &&
      game.phase === 'playing' &&
      game.seatCamp[actor] === game.seatCamp[seat]
    );
  }

  private onAction(client: Client, message: unknown): void {
    const actorId = (client.userData as ClientData | undefined)?.seat;
    const actor = actorId ? this.seats.get(actorId) : undefined;
    const parsed = ActionMessageSchema.safeParse(message);
    if (!parsed.success) {
      const seq = (message as { clientSeq?: unknown } | null)?.clientSeq;
      this.reject(client, typeof seq === 'number' ? seq : null, 'invalid-message');
      return;
    }
    const { clientSeq } = parsed.data;
    const result = this.handleAction(client, actor, parsed.data);
    if (result !== true) this.reject(client, clientSeq, result);
  }

  /** Contrôles du serveur puis application ; retourne `true` ou le motif du refus. */
  private handleAction(
    client: Client,
    actor: SeatRecord | undefined,
    { clientSeq, turnIndex, action }: ActionMessage,
  ): true | string {
    if (!actor || actor.client !== client) return 'not-seated';
    // Anti-rejeu : `clientSeq` strictement croissant par siège (§18.2).
    if (clientSeq <= actor.lastClientSeq) return 'replayed';
    actor.lastClientSeq = clientSeq;
    this.projector.privateOf(actor.id).lastClientSeq = clientSeq;
    const game = this.game;
    if (!game) return 'not-started';
    if (turnIndex !== game.turnIndex) return 'stale-turn';
    if (!this.canControl(actor.id, action.seat)) return 'not-your-seat';
    return this.apply(action);
  }

  /** Applique une action au nom du serveur ; retourne `true` ou le motif du refus. */
  private apply(action: Action): true | string {
    const before = this.game!;
    const res = applyAction(before, action);
    if (!res.ok) return res.reason;
    const game = res.state;
    this.game = game;
    this.history.push(action);
    this.projector.sync(game);
    this.updateTurnTimer();
    // Les messages partent après le patch d'état qu'ils décrivent. Colyseus consomme l'option :
    // un objet neuf par envoi.
    const after = () => ({ afterNextPatch: true });
    const ended = game.phase === 'ended';
    if (res.events.length > 0) {
      for (const client of this.clients) {
        const seat = (client.userData as ClientData | undefined)?.seat;
        const camp = seat ? (game.seatCamp[seat] ?? null) : null;
        client.send('events', { events: eventsForCamp(res.events, camp, ended) }, after());
      }
    }
    if (before.seqCounter !== game.seqCounter || before.phase !== game.phase) {
      const report = evaluate(game);
      this.broadcast('scoreReport', { report }, after());
      if (ended) {
        const over: GameOverMessage = {
          report,
          ranking: finalRanking(game, report),
          replay: { config: game.config, seed: this.seed, actions: this.history },
        };
        this.broadcast('gameOver', over, after());
        // Le chat est détruit à la fin de la partie (§11.2).
        this.chatLines = [];
        this.updateListing();
        this.resetIdle();
      }
    }
    if (!this.busy) this.schedule();
    return true;
  }

  /* ---------------------------------------------------------------- minuteurs et bots */

  private botLevel(seat: SeatId): BotLevel | null {
    return this.seats.get(seat)?.bot ?? null;
  }

  private isAbsentHuman(seat: SeatId): boolean {
    const s = this.seats.get(seat);
    return s !== undefined && s.bot === null && s.client === null;
  }

  /** Un coéquipier connecté peut jouer le tour du déconnecté (§11.4). */
  private teammateConnected(seat: SeatId): boolean {
    const game = this.game!;
    if (game.phase !== 'playing') return false;
    const camp = game.seatCamp[seat];
    return [...this.seats.values()].some(
      (s) => s.id !== seat && s.client !== null && game.seatCamp[s.id] === camp,
    );
  }

  /** Clé du minuteur en cours : tour, tuile de départ ou vote (§6.10, §10.5). */
  private currentTurnKey(game: GameState): string {
    const vote = game.objectives?.vote;
    if (vote) return `vote:${vote.kind}:${game.turnIndex}`;
    return `${game.phase}:${game.turnIndex}:${game.startIndex}`;
  }

  /**
   * Minuteur du tour entier (§6.10), des tuiles de départ (§5.6) et des votes (§10.5). Le minuteur
   * du tour est mis en pause pendant un ravitaillement et reprend ensuite.
   */
  private updateTurnTimer(): void {
    const game = this.game!;
    if (game.phase === 'ended') {
      this.clearTurnTimer();
      return;
    }
    const key = this.currentTurnKey(game);
    if (key === this.turnKey) return;
    const vote = game.objectives?.vote;
    if (vote?.kind === 'resupply' && this.turnDeadline !== null) {
      this.paused = { key: this.turnKey, remaining: Math.max(0, this.turnDeadline - Date.now()) };
    }
    this.clearTurnTimer();
    this.turnKey = key;
    let duration: number | null;
    if (vote) duration = this.timing.voteMs[vote.kind];
    else if (game.phase === 'startTiles') duration = this.timing.startTileMs;
    else duration = this.timing.turnMsOverride ?? game.config.turnTimerMs;
    if (!vote && this.paused?.key === key) duration = this.paused.remaining;
    if (!vote) this.paused = null;
    if (duration === null) return;
    this.turnDeadline = Date.now() + duration;
    this.projector.setDeadline(this.turnDeadline);
    this.turnTimer = this.clock.setTimeout(() => this.expire(), duration);
  }

  private clearTurnTimer(): void {
    this.turnTimer?.clear();
    this.turnTimer = null;
    this.turnKey = '';
    this.turnDeadline = null;
    this.projector.setDeadline(null);
  }

  /** Expiration : clôture du vote, ou `autoPlay` du siège actif (§6.10). */
  private expire(): void {
    const game = this.game;
    if (!game || game.phase === 'ended') return;
    this.turnKey = '';
    if (game.objectives?.vote) {
      this.apply({ type: 'closeObjectiveVote', seat: SYSTEM_SEAT });
      return;
    }
    const seat = activeSeat(game);
    if (seat) this.playSequence(autoPlay(game, seat));
  }

  private playSequence(actions: readonly Action[]): void {
    this.busy = true;
    try {
      for (const a of actions) if (this.apply(a) !== true) break;
    } finally {
      this.busy = false;
    }
    this.schedule();
  }

  /** Programme le prochain coup de bot, ou la relève d'un joueur absent (§11.4). */
  private schedule(): void {
    this.botTimer?.clear();
    this.botTimer = null;
    const game = this.game;
    if (!game || game.phase === 'ended') return;
    this.updateTurnTimer();
    const bot = actingSeats(game).find((s) => this.botLevel(s) !== null);
    if (bot) {
      this.botTimer = this.clock.setTimeout(() => {
        const level = this.botLevel(bot);
        const action = level ? botAction(level, this.game!, bot, this.botRng) : null;
        if (action) this.apply(action);
        else this.schedule();
      }, this.timing.botDelayMs);
      return;
    }
    const seat = activeSeat(game);
    if (
      !seat ||
      game.objectives?.vote ||
      !this.isAbsentHuman(seat) ||
      this.teammateConnected(seat)
    ) {
      this.absent = null;
      return;
    }
    const key = `${this.currentTurnKey(game)}:${seat}`;
    if (this.absent?.key !== key) {
      const record = this.seats.get(seat)!;
      // Siège libéré (départ volontaire, expulsion) : pas de délai de grâce.
      const grace = !record.freed && record.missedTurns < GRACE_TURNS;
      this.absent = {
        key,
        deadline: Date.now() + (grace ? this.timing.graceMs : this.timing.fastMs),
      };
    }
    const wait = Math.max(0, this.absent.deadline - Date.now());
    this.botTimer = this.clock.setTimeout(() => this.playForAbsent(seat), wait);
  }

  /** Le bot Facile joue le tour entier d'un joueur absent (§11.4). */
  private playForAbsent(seat: SeatId): void {
    const record = this.seats.get(seat)!;
    // La pose de la tuile de départ n'est pas un tour (§2) : elle ne compte pas parmi les 3 tours.
    const isTurn = this.game!.phase === 'playing';
    this.busy = true;
    try {
      for (let guard = 0; guard < 100; guard++) {
        const game = this.game!;
        if (game.phase === 'ended' || activeSeat(game) !== seat || game.objectives?.vote) break;
        const action = botAction('easy', game, seat, this.botRng);
        if (!action || this.apply(action) !== true) {
          for (const a of autoPlay(this.game!, seat)) if (this.apply(a) !== true) break;
          break;
        }
      }
      if (isTurn) record.missedTurns += 1;
    } finally {
      this.busy = false;
    }
    this.absent = null;
    this.schedule();
  }

  /** État autoritaire (tests et outillage). */
  get authoritativeState(): GameState | null {
    return this.game;
  }

  /** Paramètres courants (tests et outillage). */
  get roomSettings(): RoomSettings {
    return this.settings;
  }
}
