import { defineRoom, defineServer, LobbyRoom } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { GAME_ROOM, LOBBY_ROOM } from '@crassecadia/protocol';
import { mountApi } from './http/api.ts';
import type { DiscordApi } from './identity.ts';
import { DEFAULT_TIMING, GameRoom, type GameRoomTiming } from './rooms/GameRoom.ts';
import { HelloRoom } from './rooms/HelloRoom.ts';

export interface ServerOptions {
  /** Délais des salons de jeu (réduits dans les tests). */
  readonly timing?: Partial<GameRoomTiming>;
  /** API Discord (Activities, §16.2) ; `null` ou absente si l'application n'est pas configurée. */
  readonly discord?: DiscordApi | null;
}

/** Construit le serveur Colyseus (sans l'écouter) pour pouvoir le tester. */
export function createGameServer(options: ServerOptions = {}) {
  const timing: GameRoomTiming = { ...DEFAULT_TIMING, ...options.timing };
  const discord = options.discord ?? null;
  class ConfiguredGameRoom extends GameRoom {
    override timing = timing;
    override discord = discord;
  }
  return defineServer({
    transport: new WebSocketTransport(),
    greet: false,
    express: (app) => mountApi(app, { discord }),
    rooms: {
      hello: defineRoom(HelloRoom),
      // Liste en temps réel pour le navigateur de salons (§12.3).
      [GAME_ROOM]: defineRoom(ConfiguredGameRoom).enableRealtimeListing(),
      [LOBBY_ROOM]: defineRoom(LobbyRoom),
    },
  });
}
