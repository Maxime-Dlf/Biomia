/**
 * Harnais des tests d'intégration du serveur (§20.1) : vrais clients Colyseus, qui reconstruisent
 * leur vue comme le client du jeu, et enregistrement des trames reçues pour vérifier qu'aucune
 * information cachée ne circule (§18.2).
 */
import { isDeepStrictEqual } from 'node:util';
import { officialRuleSet } from '@crassecadia/content';
import {
  type Action,
  type GameEvent,
  type GameState,
  type PlayerView,
  type ScoreReport,
  stateFromView,
  viewFor,
} from '@crassecadia/engine';
import {
  type ActionRejectedMessage,
  type ChatLine,
  GAME_ROOM,
  type GameOverMessage,
  PROTOCOL_VERSION,
  type ProjectedRoom,
  type RoomCreation,
  type RoomSettings,
  viewFromProjection,
  type WelcomeMessage,
} from '@crassecadia/protocol';

/** WebSocket qui garde une copie de chaque trame reçue. */
class RecordingWebSocket extends globalThis.WebSocket {
  readonly received: Uint8Array[] = [];
  constructor(url: string | URL, protocols?: string | string[]) {
    super(url, protocols);
    this.addEventListener('message', (e: MessageEvent) => {
      const data = e.data;
      if (typeof data === 'string') this.received.push(new TextEncoder().encode(data));
      else if (data instanceof ArrayBuffer) this.received.push(new Uint8Array(data));
      else if (ArrayBuffer.isView(data)) this.received.push(new Uint8Array(data.buffer));
    });
  }
}
globalThis.WebSocket = RecordingWebSocket as typeof WebSocket;
// Le SDK capture `globalThis.WebSocket` au chargement : import dynamique après le remplacement.
const sdk = await import('@colyseus/sdk');
export type SdkRoom = Awaited<ReturnType<InstanceType<typeof sdk.Client>['joinById']>>;

/** Client Colyseus brut (navigateur de salons). */
export const sdkClient = (endpoint: string) => new sdk.Client(endpoint);

export interface JoinRequest {
  readonly name?: string;
  /** Création d'un salon (sans `roomId`). */
  readonly create?: Partial<RoomCreation>;
  /** Paramètres appliqués par l'hôte juste après la création (§12.4). */
  readonly settings?: Partial<RoomSettings>;
  readonly roomId?: string;
  readonly seatToken?: string;
  readonly password?: string;
  readonly spectator?: boolean;
  readonly discordToken?: string;
  readonly protocol?: number;
}

export class TestPlayer {
  seat = '';
  token = '';
  clientSeq = 0;
  readonly rejections: ActionRejectedMessage[] = [];
  readonly events: GameEvent[] = [];
  report: ScoreReport | null = null;
  readonly chat: ChatLine[] = [];
  gameOver: GameOverMessage | null = null;

  private constructor(readonly room: SdkRoom) {}

  static async join(endpoint: string, req: JoinRequest): Promise<TestPlayer> {
    const client = new sdk.Client(endpoint);
    const options = {
      protocol: req.protocol ?? PROTOCOL_VERSION,
      platform: 'web',
      name: req.name ?? 'Test',
      ...(req.seatToken ? { seatToken: req.seatToken } : {}),
      ...(req.password !== undefined ? { password: req.password } : {}),
      ...(req.spectator ? { spectator: true } : {}),
      ...(req.discordToken ? { discordToken: req.discordToken } : {}),
      ...(req.roomId
        ? {}
        : { create: { name: 'Salon', visibility: 'public', language: 'fr', ...req.create } }),
    };
    const room = req.roomId
      ? await client.joinById(req.roomId, options)
      : await client.create(GAME_ROOM, options);
    room.reconnection.enabled = false;
    const player = new TestPlayer(room);
    const welcome = new Promise<void>((resolve) => {
      room.onMessage('welcome', (w: WelcomeMessage) => {
        player.seat = w.seat;
        player.token = w.seatToken;
        player.clientSeq = w.lastClientSeq;
        resolve();
      });
    });
    room.onMessage('actionRejected', (m: ActionRejectedMessage) => player.rejections.push(m));
    room.onMessage('events', (m: { events: GameEvent[] }) => player.events.push(...m.events));
    room.onMessage('scoreReport', (m: { report: ScoreReport }) => {
      player.report = m.report;
    });
    room.onMessage('gameOver', (m: GameOverMessage) => {
      player.gameOver = m;
    });
    room.onMessage('pong', () => {});
    room.onMessage('chat', (line: ChatLine) => player.chat.push(line));
    room.onMessage('chatHistory', (m: { lines: ChatLine[] }) => player.chat.push(...m.lines));
    await welcome;
    if (req.settings) await player.applySettings(req.settings);
    return player;
  }

  /** L'hôte applique des paramètres (§12.4) et attend qu'ils soient pris en compte. */
  async applySettings(overrides: Partial<RoomSettings>): Promise<void> {
    const current = JSON.parse(this.projection().settings) as RoomSettings;
    const settings = { ...current, ...overrides };
    const before = this.rejections.length;
    const applied = () => isDeepStrictEqual(JSON.parse(this.projection().settings), settings);
    this.room.send('settings', { patch: overrides });
    await waitUntil(() => applied() || this.rejections.length > before);
    if (!applied()) throw new Error(`paramètres refusés : ${this.rejections.at(-1)?.reason}`);
  }

  /**
   * Attend que la vue reçue corresponde à l'état **courant** du serveur (les bots peuvent agir
   * pendant l'attente, par exemple lors d'un vote simultané), puis la retourne.
   */
  async synced(current: () => GameState): Promise<GameState> {
    for (let i = 0; i < 600; i++) {
      const state = current();
      if (isDeepStrictEqual(this.view(), viewFor(state, this.seat || 'spectator'))) return state;
      await sleep(5);
    }
    throw new Error(`vue de ${this.seat} jamais synchronisée`);
  }

  get roomId(): string {
    return this.room.roomId;
  }

  projection(): ProjectedRoom {
    return (this.room.state as { toJSON(): ProjectedRoom }).toJSON();
  }

  view(): PlayerView | null {
    return viewFromProjection(this.projection(), this.seat || 'spectator');
  }

  /** État du moteur reconstruit, comme le fait le client (§15.5). */
  mirror(): GameState | null {
    const view = this.view();
    return view ? stateFromView(view, officialRuleSet(view.config)) : null;
  }

  send(action: Action, turnIndex = this.mirror()?.turnIndex ?? 0): number {
    this.clientSeq += 1;
    this.room.send('action', { clientSeq: this.clientSeq, turnIndex, action });
    return this.clientSeq;
  }

  /** Trames reçues depuis la connexion. */
  frames(): Uint8Array[] {
    const ws = (this.room.connection.transport as unknown as { ws: RecordingWebSocket }).ws;
    return ws.received;
  }

  async rejection(clientSeq: number): Promise<string> {
    for (let i = 0; i < 400; i++) {
      const r = this.rejections.find((x) => x.clientSeq === clientSeq);
      if (r) return r.reason;
      await sleep(5);
    }
    throw new Error(`pas de refus pour clientSeq ${clientSeq}`);
  }

  /** Départ sans consentement (onglet fermé, F5, coupure réseau). */
  drop(): void {
    (this.room.connection.transport as unknown as { ws: WebSocket }).ws.close();
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function waitUntil(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > end) throw new Error('délai dépassé');
    await sleep(5);
  }
}

/** Encodage d'une chaîne courte dans le Schema et dans msgpack (fixstr, < 32 octets). */
function encodedString(text: string): Uint8Array {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length >= 32) return bytes;
  const out = new Uint8Array(bytes.length + 1);
  out[0] = 0xa0 | bytes.length;
  out.set(bytes, 1);
  return out;
}

function indexOf(haystack: Uint8Array, needle: Uint8Array): number {
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

/** Chaînes secrètes trouvées dans les trames (vide si aucune fuite). */
export function leakedSecrets(frames: readonly Uint8Array[], secrets: readonly string[]): string[] {
  const needles = secrets.map((s) => [s, encodedString(s)] as const);
  return needles.filter(([, n]) => frames.some((f) => indexOf(f, n) >= 0)).map(([s]) => s);
}
